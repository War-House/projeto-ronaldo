// comum.js — peças compartilhadas pelos consumidores (Tutorial de Mensageria, Passos 2 a 5)
import amqp from 'amqplib';

export const EXCHANGE = 'warhouse.eventos'; // exchange topic onde a API REST publica
export const DLX = 'warhouse.dlx';          // dead letter exchange (direct)
export const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost';

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Erro que não adianta tentar de novo: vai direto para a DLQ. */
export class ErroPermanente extends Error {}

// Topologia do WarHouse no RabbitMQ: uma fila por sistema, cada uma com os seus padrões de chave
export const FILAS = {
  'warhouse.notificacoes': ['pedido.#'],
  'warhouse.logistica': ['pedido.*.criado', 'pedido.*.pago', 'pedido.*.enviado', 'pedido.*.cancelado'],
  'warhouse.auditoria': ['#'],
};

/**
 * Declara (de forma idempotente) a exchange topic, a DLX, a fila do sistema, os bindings e a DLQ.
 * Se já existirem com as mesmas configurações, nada muda.
 */
export async function declararFila(canal, fila, padroes = FILAS[fila]) {
  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertExchange(DLX, 'direct', { durable: true });

  const dlq = `${fila}.dlq`;
  await canal.assertQueue(dlq, { durable: true });
  await canal.bindQueue(dlq, DLX, fila); // a DLX entrega na DLQ usando o nome da fila como chave

  await canal.assertQueue(fila, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': fila },
  });
  for (const padrao of padroes) await canal.bindQueue(fila, EXCHANGE, padrao); // os "bindings"
  return dlq;
}

/**
 * Prepara a fila de um sistema:
 *   - exchange topic warhouse.eventos (durable);
 *   - fila própria do sistema (durable), ligada aos padrões de chave que lhe interessam;
 *   - DLQ própria (<fila>.dlq), alimentada pela DLX quando a mensagem é rejeitada sem requeue.
 */
export async function prepararFila({ fila, padroes = FILAS[fila], prefetch = 1 }) {
  const conexao = await amqp.connect(RABBITMQ_URL);
  const canal = await conexao.createChannel();
  const dlq = await declararFila(canal, fila, padroes);
  await canal.prefetch(prefetch); // no máximo N mensagens sem ack por consumidor

  conexao.on('close', () => {
    console.error(`[${fila}] conexão com o RabbitMQ encerrada. Reinicie o consumidor quando o broker voltar.`);
    process.exit(1);
  });
  return { conexao, canal, dlq };
}

/**
 * Consome a fila com: ack manual, idempotência, nova tentativa limitada com espera crescente e DLQ.
 * processar(evento, msg) deve lançar erro em caso de falha (ErroPermanente = sem nova tentativa).
 */
export async function consumir({ canal, fila, sistema, processar, jaProcessado, marcarProcessado,
  maxTentativas = 3 }) {
  const processados = new Set(); // padrão: em memória (em produção: tabela com chave única)
  jaProcessado ??= (id) => processados.has(id);
  marcarProcessado ??= (id) => processados.add(id);

  console.log(`[${sistema}] aguardando eventos na fila "${fila}". Ctrl+C para sair.`);

  await canal.consume(fila, async (msg) => {
    if (msg === null) return; // fila apagada pelo broker
    let chave = msg.fields.routingKey; // numa nova tentativa, a chave original vem do próprio evento
    const requestId = msg.properties.correlationId ?? msg.properties.headers?.['x-request-id'] ?? 'sem-request-id';
    const tentativa = (msg.properties.headers?.['x-tentativas'] ?? 0) + 1;

    // 1. Mensagem malformada: não tem conserto, vai direto para a DLQ
    let evento;
    try {
      evento = JSON.parse(msg.content.toString());
    } catch {
      console.log(`${requestId} [${sistema}] ${chave}: mensagem malformada (não é JSON) -> DLQ`);
      return canal.nack(msg, false, false); // requeue = false: vai para a DLX
    }
    chave = evento.tipo ?? chave;
    const eventoId = evento.eventoId ?? msg.properties.messageId;

    // 2. Idempotência: a mesma mensagem pode chegar duas vezes ("pelo menos uma vez")
    if (eventoId && jaProcessado(eventoId)) {
      console.log(`${requestId} [${sistema}] ${chave}: evento ${eventoId} já processado, ignorando (idempotência)`);
      return canal.ack(msg);
    }

    try {
      await processar(evento, msg, { requestId, chave, tentativa });
      if (eventoId) marcarProcessado(eventoId);
      canal.ack(msg); // confirma: só agora a mensagem sai da fila
    } catch (erro) {
      if (erro instanceof ErroPermanente) {
        console.log(`${requestId} [${sistema}] ${chave}: erro permanente (${erro.message}) -> DLQ`);
        return canal.nack(msg, false, false);
      }
      if (tentativa < maxTentativas) {
        // 3. Nova tentativa limitada, com espera crescente (1 s, 2 s, ...)
        const espera = 1000 * 2 ** (tentativa - 1);
        console.log(`${requestId} [${sistema}] ${chave}: falhou na tentativa ${tentativa}/${maxTentativas} ` +
          `(${erro.message}); nova tentativa em ${espera / 1000} s`);
        await esperar(espera);
        // Republica com o contador atualizado (mantendo as propriedades) e confirma a original
        canal.sendToQueue(fila, msg.content, {
          ...msg.properties,
          persistent: true,
          headers: { ...msg.properties.headers, 'x-tentativas': tentativa },
        });
        canal.ack(msg);
      } else {
        console.log(`${requestId} [${sistema}] ${chave}: falhou ${tentativa} vezes (${erro.message}) -> DLQ`);
        canal.nack(msg, false, false); // desiste: vai para a DLQ
      }
    }
  }, { noAck: false }); // confirmação manual
}

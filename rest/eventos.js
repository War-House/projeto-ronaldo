// eventos.js — publicação dos eventos de negócio com o padrão Outbox
// (Tutorial de Mensageria, seção 7.1).
//
// Ideia: a rota NÃO fala com o RabbitMQ. Ela só grava o evento na "caixa de saída" (outbox)
// no mesmo passo em que grava o pedido. Um processo separado (o relay, abaixo) lê a outbox
// e publica no broker. Assim:
//   - a API responde 201 na hora, sem esperar o broker nem os consumidores;
//   - se o RabbitMQ estiver fora do ar, o pedido é gravado e o evento sai quando ele voltar;
//   - nunca existe pedido gravado sem evento (nem evento de pedido que não foi gravado).
// Como o relay pode publicar o mesmo evento duas vezes (cair depois de publicar e antes de
// marcar), os consumidores são idempotentes (eventoId).
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';

export const EXCHANGE = 'warhouse.eventos';
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost';

// Em memória para o protótipo. Em produção: tabela "outbox" no mesmo banco (PostgreSQL),
// gravada na MESMA transação do pedido.
const outbox = [];

/** Registra um evento na outbox. Chamado pelas rotas, junto com a alteração dos dados. */
export function registrarEvento(chave, dados, requestId) {
  const evento = {
    eventoId: randomUUID(),
    tipo: chave, // ex.: pedido.aluguel.criado
    versao: 1,
    ocorridoEm: new Date().toISOString(), // UTC
    requestId,
    dados,
  };
  outbox.push({ evento, enviado: false, tentativas: 0 });
  return evento;
}

export function estadoOutbox() {
  return {
    total: outbox.length,
    pendentes: outbox.filter((e) => !e.enviado).length,
    conectado: canal !== null,
  };
}

// ---------- Relay: publica o que está pendente ----------
let conexao = null;
let canal = null;
let conectando = false;
let proximaTentativa = 0; // espera entre tentativas de reconexão (não martelar um broker fora do ar)
let avisouFalha = false;

async function conectar() {
  if (canal || conectando || Date.now() < proximaTentativa) return;
  conectando = true;
  try {
    conexao = await amqp.connect(RABBITMQ_URL);
    // Canal de confirmação: só consideramos publicado quando o broker confirma (publisher confirms)
    canal = await conexao.createConfirmChannel();
    await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
    conexao.on('close', () => {
      canal = null; conexao = null;
      console.log('[outbox] conexão com o RabbitMQ encerrada; tentando reconectar');
    });
    conexao.on('error', () => {}); // o 'close' vem em seguida e cuida da reconexão
    avisouFalha = false;
    console.log(`[outbox] conectado ao RabbitMQ (${RABBITMQ_URL})`);
  } catch (erro) {
    canal = null;
    proximaTentativa = Date.now() + 3000;
    if (!avisouFalha) {
      console.log(`[outbox] RabbitMQ indisponível (${erro.code ?? erro.message}); os eventos aguardam na outbox`);
      avisouFalha = true;
    }
  } finally {
    conectando = false;
  }
}

async function publicarPendentes() {
  const pendentes = outbox.filter((e) => !e.enviado);
  if (pendentes.length === 0) return;
  await conectar();
  if (!canal) return;

  for (const item of pendentes) {
    const { evento } = item;
    try {
      canal.publish(EXCHANGE, evento.tipo, Buffer.from(JSON.stringify(evento)), {
        persistent: true, // gravada em disco pelo broker
        contentType: 'application/json',
        messageId: evento.eventoId, // usado pelos consumidores para a idempotência
        correlationId: evento.requestId, // X-Request-Id da requisição que originou o evento
        type: evento.tipo,
        timestamp: Math.floor(Date.now() / 1000),
        headers: { 'x-request-id': evento.requestId },
      });
      await canal.waitForConfirms(); // lança erro se o broker recusar
      item.enviado = true;
      console.log(`${evento.requestId} [outbox] publicado ${evento.tipo} (eventoId ${evento.eventoId})`);
    } catch (erro) {
      item.tentativas++;
      console.log(`[outbox] falha ao publicar ${evento.tipo}: ${erro.message}; nova tentativa em instantes`);
      conexao?.close().catch(() => {});
      canal = null;
      return;
    }
  }
}

/** Liga o relay: a cada intervalo, publica os eventos pendentes. */
export function iniciarRelay(intervaloMs = 500) {
  let ocupado = false;
  const timer = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try { await publicarPendentes(); } finally { ocupado = false; }
  }, intervaloMs);
  conectar();
  return () => { clearInterval(timer); conexao?.close().catch(() => {}); };
}

// notificacoes.js — Consumidor 1: avisa o cliente por e-mail sobre cada mudança do pedido.
// Recebe TODOS os eventos de pedido: padrão "pedido.#" (ver FILAS em comum.js)
//   pedido.aluguel.criado, pedido.compra.criado, pedido.aluguel.pago, pedido.compra.cancelado, ...
// O envio é simulado (log). E-mails do domínio "falha.test" simulam um servidor de e-mail que
// recusa o envio: a mensagem é tentada 3 vezes e vai para a DLQ (cenário de falha da demonstração).
import { prepararFila, consumir, ErroPermanente } from './comum.js';

const SISTEMA = 'notificacoes';
const FILA = 'warhouse.notificacoes';

const TEXTOS = {
  criado: 'recebemos o seu pedido',
  pago: 'o pagamento foi confirmado',
  enviado: 'o seu pedido saiu para entrega',
  concluido: 'o pedido foi concluído. Obrigado por jogar com a WarHouse!',
  cancelado: 'o pedido foi cancelado e os exemplares voltaram ao estoque',
};

async function enviarEmail(evento, msg, { requestId, chave }) {
  const pedido = evento.dados?.pedido;
  if (!pedido?.email) throw new ErroPermanente('evento sem e-mail do cliente');

  // Simulação de falha do servidor de e-mail (sempre falha para este domínio)
  if (pedido.email.endsWith('@falha.test')) {
    throw new Error(`servidor de e-mail recusou ${pedido.email}`);
  }
  const acao = chave.split('.').at(-1);
  const tipo = pedido.tipo === 'ALUGUEL' ? 'aluguel' : 'compra';
  console.log(`${requestId} [${SISTEMA}] e-mail para ${pedido.email}: "Pedido #${pedido.id} (${tipo}): ` +
    `${TEXTOS[acao] ?? acao}." (evento ${chave})`);
}

const { canal } = await prepararFila({ fila: FILA });
await consumir({ canal, fila: FILA, sistema: SISTEMA, processar: enviarEmail });

// cena4-falha.js — Cena 4: falha com novas tentativas e DLQ.
// Cria uma compra para um e-mail do domínio falha.test: o consumidor de notificações não consegue
// "enviar o e-mail", tenta 3 vezes (espera de 1 s e 2 s) e manda a mensagem para a DLQ.
// Os outros consumidores (logística e auditoria) processam normalmente: a falha fica isolada.
// Em seguida, para a duplicidade e a mensagem malformada: cd mensageria && npm run falhas
import { chamar, CHAVES } from './util.js';

console.log('== Cena 4: falha e DLQ ==');
const { requestId } = await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'COMPRA', email: 'cliente@falha.test', itens: [{ jogoId: 5, quantidade: 1 }] },
});
console.log(`
Acompanhe no log do consumidor de notificações (X-Request-Id ${requestId}):
  tentativa 1/3 -> espera 1 s -> tentativa 2/3 -> espera 2 s -> falhou 3 vezes -> DLQ
Depois:
  cd mensageria && npm run filas     (mostra warhouse.notificacoes.dlq com a mensagem e o motivo)
  cd mensageria && npm run falhas    (mesmo evento 2x -> idempotência; mensagem malformada -> DLQ)
Painel do RabbitMQ: http://localhost:15672 (guest/guest), aba Queues.`);

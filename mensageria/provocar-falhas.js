// provocar-falhas.js — cena 4 da demonstração: falha e duplicidade.
// Uso: node provocar-falhas.js
//   1. publica o MESMO evento duas vezes (mesmo eventoId) -> cada consumidor processa uma vez só;
//   2. publica uma mensagem que não é JSON -> vai direto para as DLQs;
// A falha com novas tentativas (3x e DLQ) é provocada pela API, criando um pedido com e-mail
// do domínio falha.test (ver testes/cena4-falha.js ou o README).
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { EXCHANGE, RABBITMQ_URL } from './comum.js';

const conexao = await amqp.connect(RABBITMQ_URL);
const canal = await conexao.createConfirmChannel();
await canal.assertExchange(EXCHANGE, 'topic', { durable: true });

const requestId = `demo-duplicado-${randomUUID().slice(0, 8)}`;
const evento = {
  eventoId: randomUUID(),
  tipo: 'pedido.compra.criado',
  versao: 1,
  ocorridoEm: new Date().toISOString(),
  requestId,
  dados: {
    pedido: {
      id: 900, clienteId: 'app-cliente', email: 'duplicado@exemplo.test', tipo: 'COMPRA', status: 'CRIADO',
      itens: [{ jogoId: 7, quantidade: 1 }], valorTotal: 199.9,
    },
  },
};
const opcoes = {
  persistent: true, contentType: 'application/json',
  messageId: evento.eventoId, correlationId: requestId, headers: { 'x-request-id': requestId },
};

console.log(`1) Publicando o evento ${evento.eventoId} DUAS vezes (pedido.compra.criado, X-Request-Id ${requestId})`);
canal.publish(EXCHANGE, evento.tipo, Buffer.from(JSON.stringify(evento)), opcoes);
canal.publish(EXCHANGE, evento.tipo, Buffer.from(JSON.stringify(evento)), opcoes);

const idMalformada = `demo-malformada-${randomUUID().slice(0, 8)}`;
console.log(`2) Publicando uma mensagem malformada (não é JSON), X-Request-Id ${idMalformada}`);
canal.publish(EXCHANGE, 'pedido.compra.criado', Buffer.from('{ isto não é JSON'), {
  persistent: true, correlationId: idMalformada, headers: { 'x-request-id': idMalformada },
});

await canal.waitForConfirms();
await conexao.close();
console.log('Pronto. Veja os logs dos consumidores e rode: npm run filas');

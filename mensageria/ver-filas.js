// ver-filas.js — mostra as filas, as DLQs e o motivo de cada mensagem morta.
// Uso: node ver-filas.js   (o mesmo aparece no painel http://localhost:15672, aba Queues)
import amqp from 'amqplib';
import { RABBITMQ_URL } from './comum.js';

const FILAS = ['warhouse.notificacoes', 'warhouse.logistica', 'warhouse.auditoria'];

const conexao = await amqp.connect(RABBITMQ_URL);
const canal = await conexao.createChannel();
conexao.on('error', () => {});

console.log('Fila                               prontas  consumidores');
for (const fila of FILAS.flatMap((f) => [f, `${f}.dlq`])) {
  try {
    const { messageCount, consumerCount } = await canal.checkQueue(fila);
    console.log(`${fila.padEnd(34)} ${String(messageCount).padStart(7)}  ${String(consumerCount).padStart(12)}`);
  } catch {
    console.log(`${fila.padEnd(34)}  (ainda não existe: ligue o consumidor uma vez)`);
    process.exit(0);
  }
}

// Espia (sem remover) as mensagens das DLQs: get + nack com requeue
console.log('\nMensagens nas DLQs (motivo registrado pelo RabbitMQ no cabeçalho x-death):');
for (const fila of FILAS.map((f) => `${f}.dlq`)) {
  const vistas = [];
  let msg;
  while ((msg = await canal.get(fila, { noAck: false })) && vistas.length < 20) vistas.push(msg);
  for (const m of vistas) {
    const morte = m.properties.headers?.['x-death']?.[0];
    const id = m.properties.correlationId ?? '-';
    const tentativas = m.properties.headers?.['x-tentativas'] ?? 0;
    console.log(`  ${fila}: ${m.fields.routingKey} | X-Request-Id ${id} | ` +
      `motivo=${morte?.reason ?? '?'} | tentativas feitas=${tentativas + 1} | ` +
      `"${m.content.toString().slice(0, 40)}..."`);
  }
  for (const m of vistas) canal.nack(m, false, true); // devolve para a DLQ
}
await new Promise((r) => setTimeout(r, 200));
await conexao.close();

// preparar-rabbitmq.js — cria no RabbitMQ toda a topologia do WarHouse, sem precisar ligar os consumidores.
// Uso: node preparar-rabbitmq.js   (ou, na raiz: npm run rabbit:preparar)
// Depois, abra o painel http://localhost:15672 (guest/guest):
//   aba Exchanges: warhouse.eventos (topic) e warhouse.dlx (direct)
//   aba Queues:    warhouse.notificacoes, warhouse.logistica, warhouse.auditoria e as 3 DLQs
// É idempotente: rodar de novo não altera nada.
import amqp from 'amqplib';
import { EXCHANGE, DLX, FILAS, RABBITMQ_URL, declararFila } from './comum.js';

const conexao = await amqp.connect(RABBITMQ_URL);
const canal = await conexao.createChannel();

console.log(`RabbitMQ: ${RABBITMQ_URL}`);
console.log(`Exchange ${EXCHANGE} (topic, durable) e DLX ${DLX} (direct, durable)`);
for (const [fila, padroes] of Object.entries(FILAS)) {
  const dlq = await declararFila(canal, fila, padroes);
  console.log(`  fila ${fila.padEnd(24)} bindings: ${padroes.join(', ').padEnd(68)} DLQ: ${dlq}`);
}
await conexao.close();
console.log('Topologia pronta. Painel: http://localhost:15672 (guest/guest)');

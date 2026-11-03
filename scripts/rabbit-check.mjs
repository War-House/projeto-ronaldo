// Verifica se o RabbitMQ está respondendo (porta AMQP e painel de administração).
import net from 'node:net';

function portaAberta(porta) {
  return new Promise((resolver) => {
    const s = net.connect({ host: '127.0.0.1', port: porta });
    s.setTimeout(2000);
    s.on('connect', () => { s.destroy(); resolver(true); });
    s.on('error', () => resolver(false));
    s.on('timeout', () => { s.destroy(); resolver(false); });
  });
}

const amqp = await portaAberta(5672);
let painel = false;
try {
  const r = await fetch('http://127.0.0.1:15672/api/overview', {
    headers: { Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64') },
    signal: AbortSignal.timeout(3000),
  });
  painel = r.ok;
} catch { /* ignora: painel ainda iniciando */ }

if (amqp && painel) {
  console.log('RabbitMQ OK (AMQP 5672 e painel 15672 respondendo)');
} else {
  console.error(`RabbitMQ ainda não está pronto (AMQP: ${amqp ? 'ok' : 'falhou'}, painel: ${painel ? 'ok' : 'falhou'}).`);
  console.error('Espere 30 segundos e tente de novo. Se persistir: npm run rabbit:up');
  process.exit(1);
}

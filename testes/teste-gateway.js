// teste-gateway.js — Cena 6: proteções do gateway. Mostra 200, 401, 403, 429, 504, 502 e 503.
// Uso: node teste-gateway.js            (completo, com a parte interativa do disjuntor)
//      node teste-gateway.js --rapido   (sem a parte em que se desliga a API REST)
//
// Na parte do disjuntor, o script espera você desligar a API REST
// (no terminal do "npm run tudo": digite  parar rest ; em terminais separados: Ctrl+C no da API)
// e depois religá-la (iniciar rest), e mostra cada resposta.
import { chamar, CHAVES, esperar } from './util.js';

const linha = (titulo) => console.log(`\n========== ${titulo} ==========`);

linha('200: chamada válida (painel-admin)');
await chamar('GET', '/api/jogos?limite=2', { chave: CHAVES.admin });

linha('401: sem chave e com chave errada');
await chamar('GET', '/api/jogos');
await chamar('GET', '/api/jogos', { chave: 'chave-inventada' });

linha('403: cliente conhecido, rota não permitida no plano dele');
await chamar('DELETE', '/api/jogos/2', { chave: CHAVES.cliente });   // app do cliente não altera catálogo
await chamar('GET', '/api/graphql', { chave: CHAVES.parceiro });    // parceiro não usa o GraphQL

linha('429: o parceiro tem limite de 10 requisições por minuto');
for (let i = 1; i <= 12; i++) {
  const r = await chamar('GET', '/api/jogos?limite=1', { chave: CHAVES.parceiro, mostrar: false });
  const restantes = r.cabecalhos.get('x-ratelimit-remaining');
  const espera = r.cabecalhos.get('retry-after');
  console.log(`  ${String(i).padStart(2)}: ${r.status} restantes=${restantes}${espera ? ` retry-after=${espera}s` : ''}`);
}

linha('504: serviço lento (a API demora 3 s; o gateway desiste em 2 s)');
await chamar('GET', '/api/jogos?atraso=3000', { chave: CHAVES.admin });
await chamar('GET', '/api/jogos?limite=1', { chave: CHAVES.admin }); // 200: zera o contador do disjuntor

if (process.argv.includes('--rapido')) process.exit(0);

linha('502 e 503: serviço fora do ar e disjuntor');
console.log('>>> Desligue a API REST agora (npm run tudo: "parar rest"; ou Ctrl+C no terminal da API).');
console.log('    Aguardando o 502...');
let r;
do {
  await esperar(1500);
  r = await chamar('GET', '/api/jogos?limite=1', { chave: CHAVES.admin, mostrar: false });
} while (r.status === 200);
console.log(`  -> ${r.status} ${r.dados?.detail ?? ''}`);
for (let i = 0; i < 3; i++) {
  r = await chamar('GET', '/api/jogos?limite=1', { chave: CHAVES.admin, mostrar: false });
  const espera = r.cabecalhos.get('retry-after');
  console.log(`  -> ${r.status} ${r.dados?.detail ?? ''}${espera ? ` (Retry-After: ${espera}s)` : ''}`);
}
await chamar('GET', '/api/painel/pedidos/1', { chave: CHAVES.cliente }); // a agregada também respeita o disjuntor

linha('Recuperação');
console.log('>>> Religue a API REST agora (npm run tudo: "iniciar rest"; ou npm start na pasta rest).');
console.log('    O disjuntor fica aberto por 10 s e depois deixa passar uma chamada de teste.');
do {
  await esperar(2000);
  r = await chamar('GET', '/api/jogos?limite=1', { chave: CHAVES.admin, mostrar: false });
  const espera = r.cabecalhos.get('retry-after');
  console.log(`  -> ${r.status}${espera ? ` (Retry-After: ${espera}s)` : ''}`);
} while (r.status !== 200);
console.log('Disjuntor fechado de novo: o serviço se recuperou.');

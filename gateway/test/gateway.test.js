// gateway.test.js — testes automatizados do gateway (extra: node --test)
// Sobe a API REST de verdade (em memória, sem RabbitMQ) e o gateway em portas livres.
// Requer as dependências de rest/ e gateway/ instaladas (npm run instalar, na raiz).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarGateway } from '../app.js';
import { criarApp } from '../../rest/app.js';

let rest;
let gateway;
let base;

async function ouvir(app) {
  const s = app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  return s;
}

before(async () => {
  process.env.SILENCIOSO = '1'; // sem as linhas de log de cada requisição
  rest = await ouvir(criarApp({ registrarEvento: () => {} }));
  const { app } = criarGateway({
    servicos: {
      rest: `http://127.0.0.1:${rest.address().port}`,
      graphql: 'http://127.0.0.1:9', // porta sem ninguém ouvindo: serviço fora do ar
      logistica: 'http://127.0.0.1:9',
    },
    opcoesDisjuntor: { limiteFalhas: 3, esperaMs: 60_000 },
  });
  gateway = await ouvir(app);
  base = `http://127.0.0.1:${gateway.address().port}`;
});
after(() => { gateway.close(); rest.close(); });

const chamar = (metodo, caminho, chave, corpo) => fetch(base + caminho, {
  method: metodo,
  headers: { ...(chave ? { 'X-API-Key': chave } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
  body: corpo ? JSON.stringify(corpo) : undefined,
});

test('401 sem chave, inclusive com o truque do "constructor"', async () => {
  assert.equal((await chamar('GET', '/api/jogos')).status, 401);
  assert.equal((await chamar('GET', '/api/jogos', 'constructor')).status, 401);
});

test('200 com reescrita de caminho e X-Request-Id gerado no gateway', async () => {
  const r = await chamar('GET', '/api/jogos/1', 'chave-painel-admin-456');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal((await r.json()).nome, 'Catan');
});

test('201 com Location reescrito para o endereço público', async () => {
  const r = await chamar('POST', '/api/pedidos', 'chave-app-cliente-123', {
    tipo: 'COMPRA', email: 'c@exemplo.test', itens: [{ jogoId: 7, quantidade: 1 }],
  });
  assert.equal(r.status, 201);
  assert.match(r.headers.get('location'), /^\/api\/pedidos\/\d+$/);
});

test('403 para rota fora do plano do cliente', async () => {
  assert.equal((await chamar('DELETE', '/api/jogos/2', 'chave-app-cliente-123')).status, 403);
});

test('429 com Retry-After quando o parceiro passa de 10 por minuto', async () => {
  let ultima;
  for (let i = 0; i < 11; i++) ultima = await chamar('GET', '/api/jogos?limite=1', 'chave-parceiro-ludoteca-789');
  assert.equal(ultima.status, 429);
  assert.ok(Number(ultima.headers.get('retry-after')) > 0);
});

test('504 quando o serviço demora mais que o timeout', async () => {
  const r = await chamar('GET', '/api/jogos?atraso=2500', 'chave-painel-admin-456');
  assert.equal(r.status, 504);
  await chamar('GET', '/api/jogos?limite=1', 'chave-painel-admin-456'); // sucesso: zera o disjuntor do rest
});

test('502 com o serviço fora do ar e, em seguida, 503 do disjuntor', async () => {
  const r1 = await chamar('POST', '/api/graphql', 'chave-painel-admin-456', { query: '{ jogos { nome } }' });
  assert.equal(r1.status, 502);
  await chamar('POST', '/api/graphql', 'chave-painel-admin-456', { query: '{ jogos { nome } }' });
  await chamar('POST', '/api/graphql', 'chave-painel-admin-456', { query: '{ jogos { nome } }' });
  const r4 = await chamar('POST', '/api/graphql', 'chave-painel-admin-456', { query: '{ jogos { nome } }' });
  assert.equal(r4.status, 503);
  assert.equal(r4.headers.get('content-type'), 'application/problem+json; charset=utf-8');
});

test('rota agregada com degradação graciosa (logística fora do ar -> parcial)', async () => {
  const r = await chamar('GET', '/api/painel/pedidos/1', 'chave-app-cliente-123');
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.parcial, true);
  assert.equal(corpo.entrega, null);
  assert.equal(corpo.itens[0].jogo.nome, 'Catan');
});

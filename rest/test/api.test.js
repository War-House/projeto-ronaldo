// api.test.js — testes automatizados das rotas da API REST (extra: node --test)
// Rode com: npm test (na pasta rest) ou npm test (na raiz). Não precisa do RabbitMQ:
// os eventos são capturados numa lista em vez de irem para a outbox.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../app.js';

const eventos = [];
let servidor;
let base;

before(async () => {
  process.env.SILENCIOSO = '1'; // sem as linhas de log de cada requisição
  const app = criarApp({ registrarEvento: (chave, dados, requestId) => eventos.push({ chave, dados, requestId }) });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const ADMIN = { 'X-Cliente-Id': 'painel-admin', 'X-Cliente-Perfil': 'ADMIN' };
const CLIENTE = { 'X-Cliente-Id': 'app-cliente', 'X-Cliente-Perfil': 'CLIENTE' };
const amanha = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function chamar(metodo, caminho, { corpo, cabecalhos = {} } = {}) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { ...cabecalhos, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null, cabecalhos: r.headers };
}

const novoJogo = {
  nome: 'Carcassonne', categoria: 'FAMILIA', minJogadores: 2, maxJogadores: 5,
  idadeMinima: 7, precoVenda: 239.9, precoAluguelDia: 13.9, exemplaresDisponiveis: 2,
};

test('CRUD de jogos: 201 com Location, 200, 204 e 404', async () => {
  const criado = await chamar('POST', '/jogos', { corpo: novoJogo, cabecalhos: ADMIN });
  assert.equal(criado.status, 201);
  assert.equal(criado.cabecalhos.get('location'), `/jogos/${criado.corpo.id}`);

  assert.equal((await chamar('GET', `/jogos/${criado.corpo.id}`)).status, 200);
  const alterado = await chamar('PATCH', `/jogos/${criado.corpo.id}`, { corpo: { exemplaresDisponiveis: 0 }, cabecalhos: ADMIN });
  assert.equal(alterado.corpo.disponivel, false);
  const substituido = await chamar('PUT', `/jogos/${criado.corpo.id}`, { corpo: { ...novoJogo, nome: 'Carcassonne 2' }, cabecalhos: ADMIN });
  assert.equal(substituido.corpo.nome, 'Carcassonne 2');

  assert.equal((await chamar('DELETE', `/jogos/${criado.corpo.id}`, { cabecalhos: ADMIN })).status, 204);
  const removido = await chamar('GET', `/jogos/${criado.corpo.id}`);
  assert.equal(removido.status, 404);
  assert.equal(removido.cabecalhos.get('content-type'), 'application/problem+json; charset=utf-8');
});

test('filtro, ordenação e paginação com teto de 50', async () => {
  const r = await chamar('GET', '/jogos?categoria=ESTRATEGIA&ordenar=precoVenda&ordem=desc&limite=500');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.paginacao.limite, 50);
  assert.deepEqual(r.corpo.dados.map((j) => j.nome), ['Catan', 'War']);
  assert.equal((await chamar('GET', '/jogos?pagina=0')).status, 400);
  assert.equal((await chamar('GET', '/jogos?categoria=RPG')).status, 400);
});

test('validação: 422 com a lista de campos e 400 para JSON quebrado', async () => {
  const r = await chamar('POST', '/jogos', { corpo: { nome: 'X', minJogadores: 5, maxJogadores: 2 }, cabecalhos: ADMIN });
  assert.equal(r.status, 422);
  assert.ok(r.corpo.erros.some((e) => e.campo === 'nome'));
  const quebrado = await fetch(`${base}/jogos`, { method: 'POST', headers: { ...ADMIN, 'Content-Type': 'application/json' }, body: '{"nome":' });
  assert.equal(quebrado.status, 400);
});

test('ASR 4: só o ADMIN altera o catálogo (403) e chamada sem identidade é 401', async () => {
  assert.equal((await chamar('POST', '/jogos', { corpo: novoJogo, cabecalhos: CLIENTE })).status, 403);
  assert.equal((await chamar('GET', '/pedidos')).status, 401);
});

test('R1: estoque insuficiente -> 409; R4: jogo com histórico não é excluído -> 409', async () => {
  const semEstoque = await chamar('POST', '/pedidos', {
    corpo: { tipo: 'COMPRA', email: 'a@exemplo.test', itens: [{ jogoId: 6, quantidade: 1 }] }, cabecalhos: CLIENTE,
  });
  assert.equal(semEstoque.status, 409);
  assert.equal(semEstoque.corpo.type, 'https://warhouse.example/problemas/estoque-insuficiente');
  assert.equal((await chamar('DELETE', '/jogos/1', { cabecalhos: ADMIN })).status, 409);
});

test('R2 e R3: aluguel no passado e período acima de 30 dias -> 422', async () => {
  const base = { tipo: 'ALUGUEL', email: 'a@exemplo.test', itens: [{ jogoId: 1, quantidade: 1 }] };
  const passado = await chamar('POST', '/pedidos', { corpo: { ...base, dataInicio: '2020-01-01', dias: 2 }, cabecalhos: CLIENTE });
  assert.equal(passado.corpo.type, 'https://warhouse.example/problemas/data-no-passado');
  const longo = await chamar('POST', '/pedidos', { corpo: { ...base, dataInicio: amanha(), dias: 31 }, cabecalhos: CLIENTE });
  assert.equal(longo.corpo.type, 'https://warhouse.example/problemas/periodo-invalido');
});

test('pedido criado: 201, baixa o estoque e registra o evento pedido.aluguel.criado com o X-Request-Id', async () => {
  const antes = (await chamar('GET', '/jogos/5')).corpo.exemplaresDisponiveis;
  const r = await chamar('POST', '/pedidos', {
    corpo: { tipo: 'ALUGUEL', email: 'b@exemplo.test', dataInicio: amanha(), dias: 2, itens: [{ jogoId: 5, quantidade: 1 }] },
    cabecalhos: { ...CLIENTE, 'X-Request-Id': 'teste-123' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.valorTotal, 31.8);
  assert.equal(r.corpo.email, undefined); // dado pessoal fora da resposta
  assert.equal((await chamar('GET', '/jogos/5')).corpo.exemplaresDisponiveis, antes - 1);
  const evento = eventos.find((e) => e.chave === 'pedido.aluguel.criado');
  assert.equal(evento.requestId, 'teste-123');

  // R5: cancelar devolve o estoque; cancelar de novo é transição inválida
  assert.equal((await chamar('PATCH', `/pedidos/${r.corpo.id}`, { corpo: { status: 'CANCELADO' }, cabecalhos: CLIENTE })).status, 200);
  assert.equal((await chamar('GET', '/jogos/5')).corpo.exemplaresDisponiveis, antes);
  assert.equal((await chamar('PATCH', `/pedidos/${r.corpo.id}`, { corpo: { status: 'CANCELADO' }, cabecalhos: CLIENTE })).status, 409);
});

test('dono do dado: o parceiro não vê o pedido do app-cliente (404)', async () => {
  const r = await chamar('GET', '/pedidos/1', { cabecalhos: { 'X-Cliente-Id': 'parceiro-ludoteca' } });
  assert.equal(r.status, 404);
});

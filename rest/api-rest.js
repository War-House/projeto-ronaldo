// rest/index.js - API REST do Domínio WarHouse (Grupo 04)

import express from 'express';
import { STATUS_CODES } from 'node:http';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json());

const CATEGORIAS = ['ESTRATEGIA', 'PARTY', 'FAMILIA', 'CARD_GAME', 'COOPERATIVO'];
const CAMPOS_JOGO = ['titulo', 'categoria', 'estoque', 'precoAluguel', 'precoVenda'];
const CAMPOS_ORDENAVEIS = ['id', 'titulo', 'categoria', 'estoque', 'precoAluguel'];

const jogos = [
  { id: 1, titulo: 'Catan', categoria: 'ESTRATEGIA', estoque: 5, precoAluguel: 25.0, precoVenda: 250.0 },
  { id: 2, titulo: 'Dixit', categoria: 'PARTY', estoque: 3, precoAluguel: 20.0, precoVenda: 180.0 },
  { id: 3, titulo: 'Ticket to Ride', categoria: 'FAMILIA', estoque: 0, precoAluguel: 30.0, precoVenda: 300.0 },
  { id: 4, titulo: 'Azul', categoria: 'ESTRATEGIA', estoque: 4, precoAluguel: 22.0, precoVenda: 220.0 },
  { id: 5, titulo: 'Carcassonne', categoria: 'FAMILIA', estoque: 6, precoAluguel: 18.0, precoVenda: 190.0 }
];

let proximoIdJogo = 6;

const alugueis = [
  {
    id: 1,
    clienteId: 'cliente-01',
    jogoId: 1,
    dataRetirada: '2026-11-01',
    dataDevolucao: '2026-11-08',
    valorTotal: 25.0,
    status: 'CONFIRMADO'
  }
];

let proximoIdAluguel = 2;

class ErroHttp extends Error {
  constructor(status, tipo, titulo, detalhe, extras = {}) {
    super(detalhe);
    this.status = status;
    this.tipo = tipo;
    this.titulo = titulo;
    this.extras = extras;
  }
}

const parametroInvalido = (detalhe) =>
  new ErroHttp(400, 'parametro-invalido', 'Parâmetro inválido', detalhe);

function lerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new ErroHttp(400, 'identificador-invalido', 'Identificador inválido', 'O ID deve ser um número inteiro positivo.');
  }
  return id;
}

function acharJogo(id) {
  const jogo = jogos.find((j) => j.id === id);
  if (!jogo) {
    throw new ErroHttp(404, 'jogo-nao-encontrado', 'Jogo não encontrado', `Não existe jogo cadastrado com ID ${id}.`);
  }
  return jogo;
}

function inteiroPositivo(valor, padrao, nome) {
  if (valor === undefined) return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw parametroInvalido(`${nome} deve ser um número inteiro positivo.`);
  }
  return n;
}

function validarJogo(dados, { parcial }) {
  const erros = [];
  const checar = (campo, valido, esperado) => {
    if (dados[campo] === undefined) {
      if (!parcial) erros.push({ campo, mensagem: `obrigatório: ${esperado}` });
      return;
    }
    if (!valido(dados[campo])) erros.push({ campo, mensagem: `inválido: ${esperado}` });
  };

  checar('titulo', (v) => typeof v === 'string' && v.trim().length >= 2, 'texto com pelo menos 2 caracteres');
  checar('categoria', (v) => CATEGORIAS.includes(v), `uma de ${CATEGORIAS.join(', ')}`);
  checar('estoque', (v) => Number.isInteger(v) && v >= 0, 'inteiro maior ou igual a 0');
  checar('precoAluguel', (v) => typeof v === 'number' && v > 0, 'número positivo');
  checar('precoVenda', (v) => typeof v === 'number' && v > 0, 'número positivo');

  return erros;
}

function exigirJogoValido(dados, opcoes) {
  const erros = validarJogo(dados, opcoes);
  if (erros.length > 0) {
    throw new ErroHttp(422, 'dados-invalidos', 'Dados inválidos', 'Um ou mais campos do jogo são inválidos.', { erros });
  }
}

const somenteCamposJogo = (dados) =>
  Object.fromEntries(CAMPOS_JOGO.filter((c) => dados[c] !== undefined).map((c) => [c, dados[c]]));

// GET /jogos
app.get('/jogos', (req, res) => {
  const { categoria, busca, ordenar = 'id', ordem = 'asc' } = req.query;
  const pagina = inteiroPositivo(req.query.pagina, 1, 'pagina');
  const limite = Math.min(inteiroPositivo(req.query.limite, 10, 'limite'), 50);

  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) {
    throw parametroInvalido(`categoria deve ser uma de: ${CATEGORIAS.join(', ')}.`);
  }

  if (busca !== undefined && typeof busca !== 'string') {
    throw parametroInvalido('busca deve ser um texto.');
  }

  if (!CAMPOS_ORDENAVEIS.includes(ordenar) || !['asc', 'desc'].includes(ordem)) {
    throw parametroInvalido(`ordenar: ${CAMPOS_ORDENAVEIS.join(', ')}; ordem: asc ou desc.`);
  }

  let resultado = [...jogos];

  if (categoria) {
    resultado = resultado.filter((j) => j.categoria === categoria);
  }

  if (busca) {
    resultado = resultado.filter((j) => j.titulo.toLowerCase().includes(busca.toLowerCase()));
  }

  const fator = ordem === 'desc' ? -1 : 1;
  resultado.sort((a, b) => {
    const x = a[ordenar];
    const y = b[ordenar];
    return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * fator;
  });

  const total = resultado.length;
  const inicio = (pagina - 1) * limite;

  res.json({
    dados: resultado.slice(inicio, inicio + limite),
    paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) }
  });
});

// GET /jogos/:id
app.get('/jogos/:id', (req, res) => {
  res.json(acharJogo(lerId(req)));
});

// POST /jogos
app.post('/jogos', (req, res) => {
  const dados = req.body ?? {};
  exigirJogoValido(dados, { parcial: false });

  const existeDuplicado = jogos.some(
    (j) => j.titulo.trim().toLowerCase() === dados.titulo.trim().toLowerCase() && j.categoria === dados.categoria
  );

  if (existeDuplicado) {
    throw new ErroHttp(409, 'conflito-cadastro', 'Jogo já cadastrado', 'Já existe um jogo cadastrado com este título nesta categoria.');
  }

  const novoJogo = { id: proximoIdJogo++, ...somenteCamposJogo(dados) };
  jogos.push(novoJogo);

  res.status(201).location(`/jogos/${novoJogo.id}`).json(novoJogo);
});

// PUT /jogos/:id
app.put('/jogos/:id', (req, res) => {
  const jogoAtual = acharJogo(lerId(req));
  const dados = req.body ?? {};
  exigirJogoValido(dados, { parcial: false });

  const indice = jogos.indexOf(jogoAtual);
  jogos[indice] = { id: jogoAtual.id, ...somenteCamposJogo(dados) };

  res.json(jogos[indice]);
});

// PATCH /jogos/:id
app.patch('/jogos/:id', (req, res) => {
  const jogoAtual = acharJogo(lerId(req));
  const dados = req.body ?? {};
  exigirJogoValido(dados, { parcial: true });

  Object.assign(jogoAtual, somenteCamposJogo(dados));
  res.json(jogoAtual);
});

// DELETE /jogos/:id
app.delete('/jogos/:id', (req, res) => {
  const jogoAtual = acharJogo(lerId(req));

  const aluguelAtivo = alugueis.some((a) => a.jogoId === jogoAtual.id);
  if (aluguelAtivo) {
    throw new ErroHttp(409, 'aluguel-vinculado', 'Remoção não permitida', 'Não é possível remover jogo com histórico de aluguel.');
  }

  jogos.splice(jogos.indexOf(jogoAtual), 1);
  res.status(204).end();
});

// GET /alugueis
app.get('/alugueis', (req, res) => {
  res.json(alugueis);
});

// GET /alugueis/:id
app.get('/alugueis/:id', (req, res) => {
  const id = lerId(req);
  const aluguel = alugueis.find((a) => a.id === id);
  if (!aluguel) {
    throw new ErroHttp(404, 'aluguel-nao-encontrado', 'Aluguel não encontrado', `Não existe aluguel cadastrado com ID ${id}.`);
  }
  res.json(aluguel);
});

// POST /alugueis
app.post('/alugueis', (req, res) => {
  const { clienteId = 'cliente-01', jogoId, dataRetirada, dataDevolucao } = req.body ?? {};

  if (!jogoId || !dataRetirada || !dataDevolucao) {
    throw new ErroHttp(422, 'aluguel-incompleto', 'Dados de aluguel incompletos', 'jogoId, dataRetirada e dataDevolucao são obrigatórios.');
  }

  const jogo = acharJogo(Number(jogoId));

  if (jogo.estoque <= 0) {
    throw new ErroHttp(422, 'estoque-esgotado', 'Estoque indisponível', `O jogo "${jogo.titulo}" está com estoque esgotado no momento.`);
  }

  const dRetirada = new Date(dataRetirada);
  const dDevolucao = new Date(dataDevolucao);

  if (isNaN(dRetirada.getTime()) || isNaN(dDevolucao.getTime()) || dDevolucao <= dRetirada) {
    throw new ErroHttp(400, 'datas-invalidas', 'Período de aluguel inválido', 'A data de devolução deve ser posterior à data de retirada.');
  }

  jogo.estoque -= 1;

  const novoAluguel = {
    id: proximoIdAluguel++,
    clienteId,
    jogoId: jogo.id,
    dataRetirada,
    dataDevolucao,
    valorTotal: jogo.precoAluguel,
    status: 'CONFIRMADO'
  };

  alugueis.push(novoAluguel);

  const requestId = req.get('x-request-id') || randomUUID();
  console.log(`[EVENTO] aluguel.confirmado | RequestID: ${requestId} | Aluguel: ${novoAluguel.id}`);

  res.status(201).location(`/alugueis/${novoAluguel.id}`).json(novoAluguel);
});

app.use((req, res) => {
  throw new ErroHttp(404, 'rota-inexistente', 'Rota não encontrada', `${req.method} ${req.path} não existe nesta API.`);
});

app.use((err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const esperado = status < 500;

  let detalhe = err.message;
  if (!esperado) {
    console.error('[ERRO INTERNO]', err);
    detalhe = 'Ocorreu um erro inesperado no servidor.';
  }

  res.status(status).type('application/problem+json').json({
    type: 'about:blank',
    title: err.titulo || STATUS_CODES[status],
    status,
    detail: detalhe,
    instance: req.originalUrl,
    requestId: req.get('x-request-id') || undefined,
    ...(esperado ? err.extras : {})
  });
});

const PORTA = process.env.PORT ?? 3001;
app.listen(PORTA, '127.0.0.1', () => {
  console.log(`API REST do WarHouse pronta na porta ${PORTA}`);
});

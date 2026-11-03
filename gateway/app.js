// app.js — API Gateway do WarHouse (Parte 4, Tutorial de API Gateway, Passos 3 a 6)
//
// Único ponto de entrada público (porta 3000). Atrás dele, em 127.0.0.1:
//   API REST (3001)  /api/jogos, /api/pedidos  -> /jogos, /pedidos
//   GraphQL  (4000)  /api/graphql              -> /
//   Logística(3003)  usada só pela rota agregada /api/painel/pedidos/:id
//
// Filtros, em ordem: correlação e log -> autenticação (chave de API) -> autorização por rota (403)
// -> limite de uso por cliente (429) -> encaminhamento (timeout 504, fora do ar 502, disjuntor 503)
import express from 'express';
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

// ---------- Clientes (atores do WarHouse) e planos de uso ----------
// Chaves FICTÍCIAS, só para a demonstração. Em produção: guardadas como hash em um banco ou
// cofre de segredos, nunca no código.
// "permissoes": lista de prefixos e métodos permitidos (sem a lista = acesso a tudo).
export const CLIENTES = new Map([
  ['chave-app-cliente-123', {
    id: 'app-cliente', nome: 'Aplicativo do cliente', perfil: 'CLIENTE', limitePorMinuto: 30,
    permissoes: [
      { prefixo: '/api/jogos', metodos: ['GET'] },
      { prefixo: '/api/pedidos', metodos: ['GET', 'POST', 'PATCH'] },
      { prefixo: '/api/graphql', metodos: ['GET', 'POST'] },
      { prefixo: '/api/painel', metodos: ['GET'] },
    ],
  }],
  ['chave-painel-admin-456', {
    id: 'painel-admin', nome: 'Painel administrativo', perfil: 'ADMIN', limitePorMinuto: 120,
  }],
  ['chave-parceiro-ludoteca-789', {
    id: 'parceiro-ludoteca', nome: 'Ludoteca parceira', perfil: 'PARCEIRO', limitePorMinuto: 10,
    permissoes: [
      { prefixo: '/api/jogos', metodos: ['GET'] },
      { prefixo: '/api/pedidos', metodos: ['GET', 'POST'] },
    ],
  }],
]);

// ---------- Disjuntor (circuit breaker) ----------
export class Disjuntor {
  constructor({ limiteFalhas = 3, esperaMs = 10_000 } = {}) {
    this.limiteFalhas = limiteFalhas; // quantas falhas seguidas abrem o disjuntor
    this.esperaMs = esperaMs;         // por quanto tempo ele fica aberto
    this.falhas = 0;
    this.abertoAte = 0;
  }
  permite() { return Date.now() >= this.abertoAte; } // fechado ou meio-aberto
  sucesso() { this.falhas = 0; }                     // uma chamada boa fecha o disjuntor
  falha() {
    this.falhas++;
    if (this.falhas >= this.limiteFalhas) this.abertoAte = Date.now() + this.esperaMs;
  }
  estado() {
    if (!this.permite()) return 'ABERTO';
    return this.falhas >= this.limiteFalhas ? 'MEIO-ABERTO' : 'FECHADO';
  }
  segundosRestantes() { return Math.max(1, Math.ceil((this.abertoAte - Date.now()) / 1000)); }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function criarGateway({
  servicos = {
    rest: process.env.REST_URL ?? 'http://127.0.0.1:3001',
    graphql: process.env.GRAPHQL_URL ?? 'http://127.0.0.1:4000',
    logistica: process.env.LOGISTICA_URL ?? 'http://127.0.0.1:3003',
  },
  opcoesDisjuntor = {},
  janelaMs = 60_000,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json()); // corpo máximo padrão: 100 KB

  // Um disjuntor por serviço: um serviço doente não derruba os outros (isolamento da falha)
  const disjuntores = {
    rest: new Disjuntor(opcoesDisjuntor),
    graphql: new Disjuntor(opcoesDisjuntor),
    logistica: new Disjuntor(opcoesDisjuntor),
  };

  // ---------- Tabela de rotas: prefixo público -> serviço interno (reescrita de caminho) ----------
  const ROTAS = [
    { prefixo: '/api/jogos', servico: 'rest', interno: '/jogos', timeoutMs: 2000 },
    { prefixo: '/api/pedidos', servico: 'rest', interno: '/pedidos', timeoutMs: 2000 },
    // O Apollo standalone atende em qualquer caminho: /api/graphql -> /
    { prefixo: '/api/graphql', servico: 'graphql', interno: '/', timeoutMs: 3000 },
  ];

  // ---------- Erros do gateway (Problem Details, RFC 9457) ----------
  function problema(req, res, status, detalhe, cabecalhos = {}) {
    res.status(status).set(cabecalhos).type('application/problem+json').json({
      type: 'about:blank',
      title: STATUS_CODES[status],
      status,
      detail: detalhe,
      instance: req.originalUrl,
      requestId: req.id,
    });
  }

  // ---------- Filtro 1: identificador de correlação e log ----------
  app.use((req, res, next) => {
    req.id = randomUUID(); // sempre novo: não confiamos num identificador vindo do cliente
    res.set('X-Request-Id', req.id);
    const inicio = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - inicio);
      if (!process.env.SILENCIOSO) console.log(`${req.id} [gateway] ${req.method} ${req.originalUrl} (${req.cliente?.id ?? 'anônimo'}) ` +
        `-> ${res.statusCode} (${ms} ms)`);
    });
    next();
  });

  // Verificação de saúde do próprio gateway (fora da autenticação), com o estado dos disjuntores
  app.get('/saude', (req, res) => res.json({
    status: 'ok',
    disjuntores: Object.fromEntries(Object.entries(disjuntores).map(([n, d]) => [n, d.estado()])),
  }));

  // ---------- Filtro 2: autenticação por chave de API ----------
  function autenticar(req, res, next) {
    // Map, e não objeto comum: "X-API-Key: constructor" não burla a autenticação
    const cliente = CLIENTES.get(req.get('x-api-key'));
    if (!cliente) return problema(req, res, 401, 'Informe uma chave válida no cabeçalho X-API-Key.');
    req.cliente = cliente;
    next();
  }
  app.use('/api', autenticar);

  // ---------- Filtro 3 (extra): autorização grossa por rota e método -> 403 ----------
  function autorizarRota(req, res, next) {
    const { permissoes } = req.cliente;
    const caminho = req.baseUrl + req.path; // ex.: /api/jogos/3 (sem a query string)
    const permitido = !permissoes || permissoes.some((p) =>
      (caminho === p.prefixo || caminho.startsWith(p.prefixo + '/')) && p.metodos.includes(req.method));
    if (!permitido) {
      return problema(req, res, 403, `O cliente ${req.cliente.id} não tem acesso a ${req.method} ${caminho}.`);
    }
    next();
  }
  app.use('/api', autorizarRota);

  // ---------- Filtro 4: limite de uso por cliente (janela fixa, em memória) ----------
  const janelas = new Map(); // id do cliente -> { inicio, contagem }
  function limitarUso(req, res, next) {
    const { id, limitePorMinuto } = req.cliente;
    const agora = Date.now();
    let janela = janelas.get(id);
    if (!janela || agora - janela.inicio >= janelaMs) {
      janela = { inicio: agora, contagem: 0 }; // começou um novo minuto
      janelas.set(id, janela);
    }
    janela.contagem++;
    res.set({
      'X-RateLimit-Limit': String(limitePorMinuto),
      'X-RateLimit-Remaining': String(Math.max(0, limitePorMinuto - janela.contagem)),
    });
    if (janela.contagem > limitePorMinuto) {
      const espera = Math.ceil((janela.inicio + janelaMs - agora) / 1000);
      return problema(req, res, 429, `Limite de ${limitePorMinuto} requisições por minuto excedido ` +
        `(plano do cliente ${id}).`, { 'Retry-After': String(espera) });
    }
    next();
  }
  app.use('/api', limitarUso);

  // ---------- Comunicação com os serviços ----------
  // Listas de permissão: só estes cabeçalhos passam (X-API-Key e Cookie nunca chegam aos serviços)
  const CABECALHOS_DO_CLIENTE = ['content-type', 'accept', 'accept-language', 'if-none-match'];
  const CABECALHOS_DO_SERVICO = ['content-type', 'etag', 'cache-control', 'retry-after'];

  function cabecalhosInternos(req) {
    const cabecalhos = { 'x-request-id': req.id };
    if (req.cliente) {
      cabecalhos['x-cliente-id'] = req.cliente.id;
      cabecalhos['x-cliente-perfil'] = req.cliente.perfil;
    }
    return cabecalhos;
  }

  async function encaminhar(req, res, rota) {
    const disjuntor = disjuntores[rota.servico];
    // Disjuntor aberto: recusa na hora, sem nem tentar o serviço
    if (!disjuntor.permite()) {
      return problema(req, res, 503, `O serviço ${rota.servico} está temporariamente indisponível. ` +
        'Tente novamente em instantes.', { 'Retry-After': String(disjuntor.segundosRestantes()) });
    }

    // /api/jogos/3?x=1 -> sufixo "/3?x=1" -> http://127.0.0.1:3001/jogos/3?x=1
    const sufixo = req.originalUrl.slice(rota.prefixo.length);
    let caminho = rota.interno === '/' ? sufixo : rota.interno + sufixo;
    if (!caminho.startsWith('/')) caminho = '/' + caminho;
    const url = servicos[rota.servico] + caminho;

    const cabecalhos = cabecalhosInternos(req);
    for (const nome of CABECALHOS_DO_CLIENTE) {
      if (req.get(nome)) cabecalhos[nome] = req.get(nome);
    }
    cabecalhos['x-forwarded-for'] = req.ip;
    const temCorpo = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;

    // Extra: nova tentativa com espera crescente, só para o que é seguro repetir (GET/HEAD)
    // e só para falha de conexão (timeout não se repete: o cliente já esperou o tempo máximo)
    const tentativas = ['GET', 'HEAD'].includes(req.method) ? 2 : 1;
    let resposta;
    let corpo;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      try {
        resposta = await fetch(url, {
          method: req.method,
          headers: cabecalhos,
          body: temCorpo ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(rota.timeoutMs), // desiste depois do tempo máximo
        });
        corpo = await resposta.text();
        break;
      } catch (erro) {
        disjuntor.falha(); // timeout ou conexão recusada contam como falha
        if (erro.name === 'TimeoutError') {
          return problema(req, res, 504, `O serviço ${rota.servico} não respondeu em ${rota.timeoutMs} ms.`);
        }
        if (tentativa === tentativas || !disjuntor.permite()) {
          return problema(req, res, 502, `Não foi possível obter resposta do serviço ${rota.servico}.`);
        }
        await esperar(100 * 2 ** tentativa + Math.random() * 100); // espera crescente com sorteio (jitter)
      }
    }

    // Erro 5xx do próprio serviço também é falha; 4xx é erro do cliente e não conta
    if (resposta.status >= 500) disjuntor.falha();
    else disjuntor.sucesso();

    // Repassa só os cabeçalhos da lista de permissão
    for (const nome of CABECALHOS_DO_SERVICO) {
      const valor = resposta.headers.get(nome);
      if (valor) res.set(nome, valor);
    }
    // O Location do serviço usa o caminho interno; o cliente precisa do público
    const local = resposta.headers.get('location');
    if (local && rota.interno !== '/' && local.startsWith(rota.interno)) {
      res.set('Location', rota.prefixo + local.slice(rota.interno.length));
    }
    res.status(resposta.status).send(corpo);
  }

  // ---------- Rota agregada: tela "acompanhar pedido" do app/painel ----------
  // Junta 2 serviços: API REST (pedido + jogos) e Logística (situação da entrega).
  // O pedido é indispensável; jogos e entrega são complementares (degradação graciosa).
  async function lerJson(servico, caminho, req) {
    const disjuntor = disjuntores[servico];
    if (!disjuntor.permite()) throw Object.assign(new Error('disjuntor aberto'), { status: 503 });
    let resposta;
    try {
      resposta = await fetch(servicos[servico] + caminho, {
        headers: cabecalhosInternos(req),
        signal: AbortSignal.timeout(2000),
      });
    } catch (erro) {
      disjuntor.falha();
      throw Object.assign(new Error(erro.message), { status: erro.name === 'TimeoutError' ? 504 : 502 });
    }
    if (resposta.status >= 500) disjuntor.falha();
    else disjuntor.sucesso();
    if (!resposta.ok) throw Object.assign(new Error(`HTTP ${resposta.status}`), { status: resposta.status });
    return resposta.json();
  }

  app.get('/api/painel/pedidos/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id); // o id vem do cliente: nada de "../admin"

    // 1. O pedido é indispensável: se falhar, a resposta inteira falha
    let pedido;
    try {
      pedido = await lerJson('rest', `/pedidos/${id}`, req);
    } catch (erro) {
      if (erro.status === 404) return problema(req, res, 404, 'Pedido não encontrado.');
      if (erro.status === 400) return problema(req, res, 400, 'O id do pedido deve ser um inteiro positivo.');
      const status = [503, 504].includes(erro.status) ? erro.status : 502;
      return problema(req, res, status, 'O serviço de pedidos (API REST) não respondeu.');
    }

    // 2. Complementares, em paralelo, aceitando falhas parciais
    const ids = pedido.itens.map((i) => i.jogoId).join(',');
    const [jogos, entrega] = await Promise.allSettled([
      lerJson('rest', `/jogos?ids=${ids}&limite=50`, req),
      lerJson('logistica', `/entregas/${id}`, req),
    ]);

    const indisponiveis = [];
    if (jogos.status === 'rejected') indisponiveis.push('catalogo');
    // 404 da logística = ainda não há entrega registrada (não é falha)
    if (entrega.status === 'rejected' && entrega.reason.status !== 404) indisponiveis.push('logistica');

    res.json({
      pedido: {
        id: pedido.id, tipo: pedido.tipo, status: pedido.status, valorTotal: pedido.valorTotal,
        dataInicio: pedido.dataInicio, dataFim: pedido.dataFim, criadoEm: pedido.criadoEm,
      },
      itens: pedido.itens.map((item) => {
        const jogo = jogos.status === 'fulfilled' ? jogos.value.dados.find((j) => j.id === item.jogoId) : null;
        return {
          quantidade: item.quantidade,
          jogo: jogo ? { id: jogo.id, nome: jogo.nome, categoria: jogo.categoria } : null,
        };
      }),
      entrega: entrega.status === 'fulfilled'
        ? { situacao: entrega.value.situacao, codigoRastreio: entrega.value.codigoRastreio, atualizadoEm: entrega.value.atualizadoEm }
        : null,
      parcial: indisponiveis.length > 0,
      indisponiveis,
    });
  });

  // ---------- Rotas encaminhadas ----------
  for (const rota of ROTAS) {
    app.use(rota.prefixo, (req, res) => encaminhar(req, res, rota));
  }

  // ---------- Nenhuma rota atende / erros inesperados (sempre por último) ----------
  app.use((req, res) => {
    problema(req, res, 404, `Nenhuma rota atende ${req.method} ${req.path}.`);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(req.id, err);
    const detalhe = err.type === 'entity.parse.failed' ? 'O corpo da requisição não é um JSON válido.'
      : status >= 500 ? 'Erro inesperado no gateway.' : err.message;
    problema(req, res, status, detalhe);
  });

  return { app, disjuntores };
}

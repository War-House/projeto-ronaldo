// app.js — API REST do WarHouse (Parte 1, Tutorial de API REST, Passos 2 a 6)
//
// Recursos relacionados:
//   /jogos    catálogo de jogos de tabuleiro (CRUD completo, filtros, ordenação e paginação)
//   /pedidos  pedidos de ALUGUEL ou COMPRA de jogos (cada item aponta para um jogo)
//
// Regras de negócio próprias do tema (rastreadas para os documentos do semestre):
//   R1 (409) Jogo sem exemplares suficientes não pode ser alugado nem vendido
//            -> ASR 1 e restrição EARS "Enquanto o estoque for zero..."
//   R2 (422) Aluguel não pode começar no passado
//   R3 (422) Aluguel dura de 1 a 30 dias
//   R4 (409) Jogo com histórico de pedidos não pode ser excluído
//            -> restrição EARS "não permitir a exclusão física de um jogo com histórico" (ASR 5)
//   R5 (409) Transição de status inválida (ex.: cancelar um pedido já ENVIADO)
//            -> ASR 6 (acompanhamento confiável dos pedidos)
//   R6 (409) Um mesmo cliente (e-mail) tem no máximo 3 aluguéis ativos
//   R7 (403) Só o perfil ADMIN altera o catálogo; o cliente só vê os próprios pedidos (404)
//            -> ASR 4 (segurança e controle de acesso)
//   Datas e carimbos sempre em UTC (restrição EARS 3).
import express from 'express';
import { randomUUID } from 'node:crypto';
import { ErroHttp, parametroInvalido, tratadorDeErros } from './erros.js';
import { CATEGORIAS, TIPOS_PEDIDO, STATUS_PEDIDO, criarBanco, hoje, somarDias } from './dados.js';
import { registrarEvento as registrarEventoPadrao, estadoOutbox } from './eventos.js';

const CAMPOS_JOGO = ['nome', 'categoria', 'minJogadores', 'maxJogadores', 'idadeMinima',
  'precoVenda', 'precoAluguelDia', 'exemplaresDisponiveis'];
const CAMPOS_ORDENAVEIS = ['id', 'nome', 'precoVenda', 'precoAluguelDia', 'exemplaresDisponiveis'];
const STATUS_ATIVOS = ['CRIADO', 'PAGO', 'ENVIADO'];
const MAX_ALUGUEIS_ATIVOS = 3;
const MAX_DIAS_ALUGUEL = 30;

// Transições permitidas do pedido (máquina de estados)
const TRANSICOES = {
  CRIADO: ['PAGO', 'CANCELADO'],
  PAGO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['CONCLUIDO'],
  CONCLUIDO: [],
  CANCELADO: [],
};

const arredondar = (v) => Math.round(v * 100) / 100;

export function criarApp({ banco = criarBanco(), registrarEvento = registrarEventoPadrao } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json()); // limite padrão do corpo: 100 KB

  // ---------- Correlação e log: usa o X-Request-Id do gateway (ou cria um, se chamado direto) ----------
  app.use((req, res, next) => {
    req.id = req.get('x-request-id') ?? `direto-${randomUUID()}`;
    res.set('X-Request-Id', req.id);
    const inicio = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - inicio);
      const quem = req.get('x-cliente-id') ?? '-';
      if (!process.env.SILENCIOSO) console.log(`${req.id} [rest] ${req.method} ${req.originalUrl} (${quem}) -> ${res.statusCode} (${ms} ms)`);
    });
    next();
  });

  // ---------- Identidade repassada pelo gateway ----------
  // O gateway autentica a chave de API e informa quem é o cliente nestes cabeçalhos.
  // Isso só é seguro porque a API ouve apenas em 127.0.0.1 (rede interna). Ver riscos no README.
  const identidade = (req) => ({
    id: req.get('x-cliente-id'),
    perfil: req.get('x-cliente-perfil') ?? 'CLIENTE',
  });

  function exigirIdentidade(req) {
    const cliente = identidade(req);
    if (!cliente.id) {
      throw new ErroHttp(401, 'sem-identidade', 'Chamada sem identidade',
        'Esta rota exige o cabeçalho X-Cliente-Id. Use o gateway.');
    }
    return cliente;
  }

  function exigirAdmin(req) {
    const cliente = exigirIdentidade(req);
    if (cliente.perfil !== 'ADMIN') {
      throw new ErroHttp(403, 'apenas-administrador', 'Operação restrita',
        'Somente o perfil ADMIN pode alterar o catálogo de jogos.');
    }
    return cliente;
  }

  // ---------- Funções auxiliares ----------
  function lerId(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw new ErroHttp(400, 'identificador-invalido', 'Identificador inválido',
        'O id deve ser um número inteiro positivo.');
    }
    return id;
  }

  function acharJogo(id) {
    const jogo = banco.jogos.find((j) => j.id === id);
    if (!jogo) {
      throw new ErroHttp(404, 'jogo-nao-encontrado', 'Jogo não encontrado', `Não existe jogo com id ${id}.`);
    }
    return jogo;
  }

  function inteiroPositivo(valor, padrao, nome) {
    if (valor === undefined) return padrao;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1) throw parametroInvalido(`${nome} deve ser um inteiro positivo.`);
    return n;
  }

  const textoValido = (v) => typeof v === 'string' && v.trim().length >= 2 && v.length <= 80;
  const inteiroEntre = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
  const precoValido = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100_000;

  // Devolve a lista de problemas (lista vazia = tudo certo)
  function validarJogo(dados, { parcial, atual = {} }) {
    const erros = [];
    const checar = (campo, valido, esperado) => {
      if (dados[campo] === undefined) {
        if (!parcial) erros.push({ campo, mensagem: `obrigatório: ${esperado}` });
        return;
      }
      if (!valido(dados[campo])) erros.push({ campo, mensagem: `inválido: ${esperado}` });
    };
    checar('nome', textoValido, 'texto de 2 a 80 caracteres');
    checar('categoria', (v) => CATEGORIAS.includes(v), `um de ${CATEGORIAS.join(', ')}`);
    checar('minJogadores', inteiroEntre(1, 20), 'inteiro de 1 a 20');
    checar('maxJogadores', inteiroEntre(1, 20), 'inteiro de 1 a 20');
    checar('idadeMinima', inteiroEntre(0, 18), 'inteiro de 0 a 18');
    checar('precoVenda', precoValido, 'número maior que zero');
    checar('precoAluguelDia', precoValido, 'número maior que zero');
    checar('exemplaresDisponiveis', inteiroEntre(0, 1000), 'inteiro de 0 a 1000');

    // Regras entre campos (consideram o valor atual no PATCH)
    const final = { ...atual, ...dados };
    if (erros.length === 0 && final.maxJogadores < final.minJogadores) {
      erros.push({ campo: 'maxJogadores', mensagem: 'deve ser maior ou igual a minJogadores' });
    }
    if (erros.length === 0 && final.precoAluguelDia >= final.precoVenda) {
      erros.push({ campo: 'precoAluguelDia', mensagem: 'a diária do aluguel deve ser menor que o preço de venda' });
    }
    return erros;
  }

  function exigirDadosValidos(erros) {
    if (erros.length > 0) {
      throw new ErroHttp(422, 'dados-invalidos', 'Dados inválidos', 'Um ou mais campos são inválidos.', { erros });
    }
  }

  // Copia só os campos permitidos (evita o mass assignment, OWASP API3)
  const somenteCampos = (dados) =>
    Object.fromEntries(CAMPOS_JOGO.filter((c) => dados[c] !== undefined).map((c) => [c, dados[c]]));

  const comDisponibilidade = (jogo) => ({ ...jogo, disponivel: jogo.exemplaresDisponiveis > 0 });

  // =====================================================================
  // Verificação de saúde (usada pelo gateway e no roteiro de demonstração)
  // =====================================================================
  app.get('/saude', (req, res) => {
    res.json({ status: 'ok', servico: 'warhouse-rest', outbox: estadoOutbox() });
  });

  // =====================================================================
  // /jogos — CRUD completo
  // =====================================================================
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  app.get('/jogos', async (req, res) => {
    const { categoria, busca, disponivel, ids, ordenar = 'id', ordem = 'asc' } = req.query;
    const pagina = inteiroPositivo(req.query.pagina, 1, 'pagina');
    const limite = Math.min(inteiroPositivo(req.query.limite, 10, 'limite'), 50); // teto de 50

    if (categoria !== undefined && !CATEGORIAS.includes(categoria)) {
      throw parametroInvalido(`categoria deve ser uma de: ${CATEGORIAS.join(', ')}.`);
    }
    if (busca !== undefined && typeof busca !== 'string') throw parametroInvalido('busca deve ser um texto.');
    if (disponivel !== undefined && !['true', 'false'].includes(disponivel)) {
      throw parametroInvalido('disponivel deve ser true ou false.');
    }
    if (!CAMPOS_ORDENAVEIS.includes(ordenar) || !['asc', 'desc'].includes(ordem)) {
      throw parametroInvalido(`ordenar: ${CAMPOS_ORDENAVEIS.join(', ')}; ordem: asc ou desc.`);
    }
    let listaIds;
    if (ids !== undefined) {
      if (typeof ids !== 'string') throw parametroInvalido('ids deve ser uma lista separada por vírgulas.');
      listaIds = ids.split(',').map(Number);
      if (listaIds.length > 50 || listaIds.some((n) => !Number.isInteger(n) || n < 1)) {
        throw parametroInvalido('ids deve ter até 50 inteiros positivos separados por vírgulas.');
      }
    }

    // Somente para a demonstração do timeout do gateway (504): ?atraso=3000 simula lentidão
    const atraso = Number(req.query.atraso);
    if (atraso > 0 && process.env.NODE_ENV !== 'production') await esperar(Math.min(atraso, 10_000));

    let resultado = [...banco.jogos];
    if (listaIds) resultado = resultado.filter((j) => listaIds.includes(j.id));
    if (categoria) resultado = resultado.filter((j) => j.categoria === categoria);
    if (disponivel === 'true') resultado = resultado.filter((j) => j.exemplaresDisponiveis > 0);
    if (disponivel === 'false') resultado = resultado.filter((j) => j.exemplaresDisponiveis === 0);
    if (busca) resultado = resultado.filter((j) => j.nome.toLowerCase().includes(busca.toLowerCase()));

    const fator = ordem === 'desc' ? -1 : 1;
    resultado.sort((a, b) => {
      const x = a[ordenar];
      const y = b[ordenar];
      return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * fator;
    });

    const total = resultado.length;
    const inicio = (pagina - 1) * limite;
    res.json({
      dados: resultado.slice(inicio, inicio + limite).map(comDisponibilidade),
      paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) },
    });
  });

  app.get('/jogos/:id', (req, res) => {
    res.json(comDisponibilidade(acharJogo(lerId(req))));
  });

  app.post('/jogos', (req, res) => {
    exigirAdmin(req);
    const dados = req.body ?? {};
    exigirDadosValidos(validarJogo(dados, { parcial: false }));
    const mesmoNome = (j) => j.nome.trim().toLowerCase() === dados.nome.trim().toLowerCase();
    if (banco.jogos.some(mesmoNome)) {
      throw new ErroHttp(409, 'jogo-duplicado', 'Jogo já cadastrado', `Já existe um jogo chamado "${dados.nome}".`);
    }
    const novo = { id: banco.proximoJogoId++, ...somenteCampos(dados) };
    banco.jogos.push(novo);
    registrarEvento('jogo.criado', { jogo: novo }, req.id);
    res.status(201).location(`/jogos/${novo.id}`).json(comDisponibilidade(novo));
  });

  app.put('/jogos/:id', (req, res) => {
    exigirAdmin(req);
    const jogo = acharJogo(lerId(req));
    const dados = req.body ?? {};
    exigirDadosValidos(validarJogo(dados, { parcial: false }));
    const indice = banco.jogos.indexOf(jogo);
    banco.jogos[indice] = { id: jogo.id, ...somenteCampos(dados) };
    res.json(comDisponibilidade(banco.jogos[indice]));
  });

  app.patch('/jogos/:id', (req, res) => {
    exigirAdmin(req);
    const jogo = acharJogo(lerId(req));
    const dados = req.body ?? {};
    exigirDadosValidos(validarJogo(dados, { parcial: true, atual: jogo }));
    Object.assign(jogo, somenteCampos(dados)); // seguro: só os campos listados
    res.json(comDisponibilidade(jogo));
  });

  app.delete('/jogos/:id', (req, res) => {
    exigirAdmin(req);
    const jogo = acharJogo(lerId(req));
    // R4: não excluir fisicamente um jogo que aparece no histórico de pedidos
    const usado = banco.pedidos.filter((p) => p.itens.some((i) => i.jogoId === jogo.id));
    if (usado.length > 0) {
      throw new ErroHttp(409, 'jogo-com-historico', 'Jogo com histórico de pedidos',
        `O jogo ${jogo.id} aparece em ${usado.length} pedido(s) e não pode ser excluído. ` +
        'Zere o estoque (PATCH exemplaresDisponiveis = 0) para retirá-lo do catálogo.',
        { pedidos: usado.map((p) => p.id) });
    }
    banco.jogos.splice(banco.jogos.indexOf(jogo), 1);
    res.status(204).end();
  });

  // =====================================================================
  // /pedidos — aluguel ou compra
  // =====================================================================
  const podeVer = (cliente, pedido) => cliente.perfil === 'ADMIN' || pedido.clienteId === cliente.id;

  function acharPedido(req) {
    const cliente = exigirIdentidade(req);
    const id = lerId(req);
    const pedido = banco.pedidos.find((p) => p.id === id);
    // Pedido de outro cliente responde 404, e não 403: não revelamos que ele existe (OWASP API1)
    if (!pedido || !podeVer(cliente, pedido)) {
      throw new ErroHttp(404, 'pedido-nao-encontrado', 'Pedido não encontrado', `Não existe pedido com id ${id}.`);
    }
    return { cliente, pedido };
  }

  // O e-mail fica de fora da representação pública (dado pessoal, LGPD)
  const publico = ({ email, ...resto }) => resto;

  app.get('/pedidos', (req, res) => {
    const cliente = exigirIdentidade(req);
    const { status, tipo, ordem = 'desc' } = req.query;
    const pagina = inteiroPositivo(req.query.pagina, 1, 'pagina');
    const limite = Math.min(inteiroPositivo(req.query.limite, 10, 'limite'), 50);
    if (status !== undefined && !STATUS_PEDIDO.includes(status)) {
      throw parametroInvalido(`status deve ser um de: ${STATUS_PEDIDO.join(', ')}.`);
    }
    if (tipo !== undefined && !TIPOS_PEDIDO.includes(tipo)) {
      throw parametroInvalido(`tipo deve ser um de: ${TIPOS_PEDIDO.join(', ')}.`);
    }
    if (!['asc', 'desc'].includes(ordem)) throw parametroInvalido('ordem deve ser asc ou desc.');

    let resultado = banco.pedidos.filter((p) => podeVer(cliente, p));
    if (status) resultado = resultado.filter((p) => p.status === status);
    if (tipo) resultado = resultado.filter((p) => p.tipo === tipo);
    resultado = [...resultado].sort((a, b) => (a.id - b.id) * (ordem === 'desc' ? -1 : 1));

    const total = resultado.length;
    const inicio = (pagina - 1) * limite;
    res.json({
      dados: resultado.slice(inicio, inicio + limite).map(publico),
      paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) },
    });
  });

  app.get('/pedidos/:id', (req, res) => {
    res.json(publico(acharPedido(req).pedido));
  });

  function validarPedido(dados) {
    const erros = [];
    if (!TIPOS_PEDIDO.includes(dados.tipo)) {
      erros.push({ campo: 'tipo', mensagem: `obrigatório: um de ${TIPOS_PEDIDO.join(', ')}` });
    }
    if (typeof dados.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email) || dados.email.length > 120) {
      erros.push({ campo: 'email', mensagem: 'obrigatório: e-mail válido para as notificações' });
    }
    if (!Array.isArray(dados.itens) || dados.itens.length < 1 || dados.itens.length > 10) {
      erros.push({ campo: 'itens', mensagem: 'obrigatório: lista com 1 a 10 itens' });
    } else {
      dados.itens.forEach((item, i) => {
        if (!Number.isInteger(item?.jogoId) || item.jogoId < 1) {
          erros.push({ campo: `itens[${i}].jogoId`, mensagem: 'inválido: inteiro positivo' });
        }
        if (!Number.isInteger(item?.quantidade) || item.quantidade < 1 || item.quantidade > 5) {
          erros.push({ campo: `itens[${i}].quantidade`, mensagem: 'inválido: inteiro de 1 a 5' });
        }
      });
      const ids = dados.itens.map((i) => i?.jogoId);
      if (new Set(ids).size !== ids.length) {
        erros.push({ campo: 'itens', mensagem: 'o mesmo jogo aparece mais de uma vez; use quantidade' });
      }
    }
    if (dados.tipo === 'ALUGUEL') {
      if (typeof dados.dataInicio !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataInicio) ||
          Number.isNaN(Date.parse(`${dados.dataInicio}T00:00:00Z`))) {
        erros.push({ campo: 'dataInicio', mensagem: 'obrigatório no aluguel: data no formato AAAA-MM-DD' });
      }
      if (!Number.isInteger(dados.dias)) {
        erros.push({ campo: 'dias', mensagem: 'obrigatório no aluguel: número inteiro de dias' });
      }
    }
    return erros;
  }

  app.post('/pedidos', (req, res) => {
    const cliente = exigirIdentidade(req);
    const dados = req.body ?? {};
    exigirDadosValidos(validarPedido(dados));

    // Os jogos precisam existir (422: o JSON é válido, mas aponta para algo inexistente)
    const faltando = dados.itens.filter((i) => !banco.jogos.some((j) => j.id === i.jogoId));
    if (faltando.length > 0) {
      throw new ErroHttp(422, 'jogo-inexistente', 'Jogo inexistente',
        `Jogo(s) não encontrado(s): ${faltando.map((i) => i.jogoId).join(', ')}.`);
    }

    let dataInicio = null;
    let dataFim = null;
    let dias = null;
    if (dados.tipo === 'ALUGUEL') {
      // R2: o aluguel não pode começar no passado (comparação em UTC)
      if (dados.dataInicio < hoje()) {
        throw new ErroHttp(422, 'data-no-passado', 'Data no passado',
          `O aluguel não pode começar em ${dados.dataInicio}: a data é anterior a hoje (${hoje()}, UTC).`);
      }
      // R3: período de 1 a 30 dias
      if (dados.dias < 1 || dados.dias > MAX_DIAS_ALUGUEL) {
        throw new ErroHttp(422, 'periodo-invalido', 'Período de aluguel inválido',
          `O aluguel deve durar de 1 a ${MAX_DIAS_ALUGUEL} dias (recebido: ${dados.dias}).`);
      }
      // R6: no máximo 3 aluguéis ativos por cliente (e-mail)
      const ativos = banco.pedidos.filter((p) => p.tipo === 'ALUGUEL' && STATUS_ATIVOS.includes(p.status) &&
        p.email.toLowerCase() === dados.email.toLowerCase());
      if (ativos.length >= MAX_ALUGUEIS_ATIVOS) {
        throw new ErroHttp(409, 'limite-de-alugueis', 'Limite de aluguéis ativos',
          `O cliente ${dados.email} já tem ${ativos.length} aluguéis ativos (máximo ${MAX_ALUGUEIS_ATIVOS}).`);
      }
      dataInicio = dados.dataInicio;
      dias = dados.dias;
      dataFim = somarDias(dataInicio, dias);
    }

    // R1: estoque suficiente para TODOS os itens (nada é reservado se um item faltar)
    const semEstoque = dados.itens
      .map((i) => ({ item: i, jogo: banco.jogos.find((j) => j.id === i.jogoId) }))
      .filter(({ item, jogo }) => jogo.exemplaresDisponiveis < item.quantidade);
    if (semEstoque.length > 0) {
      throw new ErroHttp(409, 'estoque-insuficiente', 'Estoque insuficiente',
        semEstoque.map(({ item, jogo }) =>
          `"${jogo.nome}": pedidos ${item.quantidade}, disponíveis ${jogo.exemplaresDisponiveis}`).join('; ') + '.',
        { jogos: semEstoque.map(({ jogo }) => jogo.id) });
    }

    // Tudo certo: reserva os exemplares, grava o pedido e registra o evento (outbox) no mesmo passo.
    // Como o Node.js executa este trecho sem interrupção (não há await), duas requisições
    // simultâneas não conseguem reservar o mesmo exemplar (ASR 1, sem overbooking).
    let valorTotal = 0;
    for (const item of dados.itens) {
      const jogo = banco.jogos.find((j) => j.id === item.jogoId);
      jogo.exemplaresDisponiveis -= item.quantidade;
      valorTotal += dados.tipo === 'ALUGUEL'
        ? jogo.precoAluguelDia * item.quantidade * dias
        : jogo.precoVenda * item.quantidade;
      if (jogo.exemplaresDisponiveis === 0) {
        registrarEvento('jogo.estoque.esgotado', { jogoId: jogo.id, nome: jogo.nome }, req.id);
      }
    }
    const agora = new Date().toISOString();
    const novo = {
      id: banco.proximoPedidoId++,
      clienteId: cliente.id,
      email: dados.email,
      tipo: dados.tipo,
      status: 'CRIADO',
      itens: dados.itens.map(({ jogoId, quantidade }) => ({ jogoId, quantidade })),
      dataInicio, dataFim, dias,
      valorTotal: arredondar(valorTotal),
      criadoEm: agora,
      atualizadoEm: agora,
    };
    banco.pedidos.push(novo);
    // Evento com chave hierárquica: pedido.<tipo>.<status>, ex.: pedido.aluguel.criado
    registrarEvento(`pedido.${novo.tipo.toLowerCase()}.criado`, { pedido: novo }, req.id);

    // 201 sem esperar o RabbitMQ nem os consumidores
    res.status(201).location(`/pedidos/${novo.id}`).json(publico(novo));
  });

  // Alterar o status (pagar, enviar, concluir, cancelar)
  app.patch('/pedidos/:id', (req, res) => {
    const { cliente, pedido } = acharPedido(req);
    const { status } = req.body ?? {};
    if (!STATUS_PEDIDO.includes(status)) {
      throw new ErroHttp(422, 'dados-invalidos', 'Dados inválidos', 'Um ou mais campos são inválidos.',
        { erros: [{ campo: 'status', mensagem: `obrigatório: um de ${STATUS_PEDIDO.join(', ')}` }] });
    }
    // O cliente só pode cancelar; as demais etapas são do painel administrativo
    if (cliente.perfil !== 'ADMIN' && status !== 'CANCELADO') {
      throw new ErroHttp(403, 'transicao-restrita', 'Operação restrita',
        `Somente o perfil ADMIN pode mudar o status para ${status}.`);
    }
    // R5: máquina de estados
    if (!TRANSICOES[pedido.status].includes(status)) {
      throw new ErroHttp(409, 'transicao-invalida', 'Transição de status inválida',
        `Um pedido ${pedido.status} não pode passar para ${status}.` +
        (TRANSICOES[pedido.status].length ? ` Permitido: ${TRANSICOES[pedido.status].join(', ')}.` : ''));
    }
    // Devolve os exemplares ao estoque no cancelamento e na devolução do aluguel
    if (status === 'CANCELADO' || (status === 'CONCLUIDO' && pedido.tipo === 'ALUGUEL')) {
      for (const item of pedido.itens) {
        const jogo = banco.jogos.find((j) => j.id === item.jogoId);
        if (jogo) jogo.exemplaresDisponiveis += item.quantidade;
      }
    }
    pedido.status = status;
    pedido.atualizadoEm = new Date().toISOString();
    registrarEvento(`pedido.${pedido.tipo.toLowerCase()}.${status.toLowerCase()}`, { pedido }, req.id);
    res.json(publico(pedido));
  });

  // ---------- Rota inexistente e tratador de erros (sempre por último) ----------
  app.use((req) => {
    throw new ErroHttp(404, 'rota-nao-encontrada', 'Rota não encontrada',
      `${req.method} ${req.path} não existe nesta API.`);
  });
  app.use(tratadorDeErros);

  return app;
}

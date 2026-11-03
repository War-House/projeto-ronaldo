// resolvers.js — a lógica que busca os dados (Tutorial de GraphQL, Passos 3 e 5, e seção 7.1)
import { GraphQLError } from 'graphql';
import DataLoader from 'dataloader';

// ---------- DataLoader: resolve o problema N+1 ----------
// Sem ele, "meusPedidos { itens { jogo { nome } } }" faria 1 chamada GET /jogos/:id por item.
// Com ele, todos os jogos pedidos no mesmo ciclo viram UMA chamada: GET /jogos?ids=1,3,8
// O loader é criado a cada requisição (no contexto), para o cache de um cliente não vazar para outro.
export const criarJogoLoader = (rest) =>
  new DataLoader(async (ids) => {
    const { dados } = await rest.get(`/jogos?ids=${ids.join(',')}&limite=50`);
    // Deve devolver na MESMA ORDEM dos ids pedidos (null para os que não existem)
    return ids.map((id) => dados.find((j) => String(j.id) === String(id)) ?? null);
  });

function idNumerico(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new GraphQLError(`${campo} deve ser um número inteiro positivo.`, {
      extensions: { code: 'BAD_USER_INPUT', campo },
    });
  }
  return n;
}

const STATUS_ATIVOS = ['CRIADO', 'PAGO', 'ENVIADO'];

async function listarMeusPedidos(rest, { status, tipo } = {}) {
  const params = new URLSearchParams({ limite: '50' });
  if (status) params.set('status', status);
  if (tipo) params.set('tipo', tipo);
  const { dados } = await rest.get(`/pedidos?${params}`);
  return dados;
}

export const resolvers = {
  Query: {
    jogos: async (parent, { categoria, busca, apenasDisponiveis, limite }, { rest, jogoLoader }) => {
      const params = new URLSearchParams({ limite: String(Math.min(Math.max(limite ?? 10, 1), 50)) });
      if (categoria) params.set('categoria', categoria);
      if (busca) params.set('busca', busca);
      if (apenasDisponiveis) params.set('disponivel', 'true');
      const { dados } = await rest.get(`/jogos?${params}`);
      // Aproveita a resposta para preencher o cache do DataLoader
      for (const jogo of dados) jogoLoader.prime(String(jogo.id), jogo);
      return dados;
    },

    jogo: (parent, { id }, { jogoLoader }) => jogoLoader.load(String(idNumerico(id, 'id'))),

    meusPedidos: (parent, args, { rest }) => listarMeusPedidos(rest, args),

    pedido: async (parent, { id }, { rest }) => {
      try {
        return await rest.get(`/pedidos/${idNumerico(id, 'id')}`);
      } catch (erro) {
        if (erro.extensions?.code === 'NOT_FOUND') return null; // Pedido sem "!": não existe -> null
        throw erro;
      }
    },

    resumoPedidos: async (parent, args, { rest }) => {
      // Mesmo caminho de meusPedidos sem filtro: o cliente REST reaproveita a resposta (1 chamada só)
      const pedidos = await listarMeusPedidos(rest);
      return {
        total: pedidos.length,
        alugueisAtivos: pedidos.filter((p) => p.tipo === 'ALUGUEL' && STATUS_ATIVOS.includes(p.status)).length,
        valorTotal: Math.round(pedidos.filter((p) => p.status !== 'CANCELADO')
          .reduce((soma, p) => soma + p.valorTotal, 0) * 100) / 100,
      };
    },
  },

  // Campos calculados: o "parent" é o objeto do nível de cima
  Jogo: {
    jogadores: (jogo) => (jogo.minJogadores === jogo.maxJogadores
      ? `${jogo.minJogadores} jogadores`
      : `${jogo.minJogadores} a ${jogo.maxJogadores} jogadores`),
  },

  ItemPedido: {
    // A API REST guarda jogoId; o schema expõe o jogo (o schema não espelha o banco)
    jogo: (item, args, { jogoLoader }) => jogoLoader.load(String(item.jogoId)),
  },

  Mutation: {
    criarPedido: (parent, { dados }, { rest }) => {
      const corpo = {
        tipo: dados.tipo,
        email: dados.email,
        itens: dados.itens.map((item, i) => ({
          jogoId: idNumerico(item.jogoId, `itens[${i}].jogoId`),
          quantidade: item.quantidade,
        })),
        ...(dados.dataInicio !== undefined && dados.dataInicio !== null ? { dataInicio: dados.dataInicio } : {}),
        ...(dados.dias !== undefined && dados.dias !== null ? { dias: dados.dias } : {}),
      };
      // As regras de negócio (estoque, data no passado, período) ficam na API REST:
      // os erros 409/422 dela voltam como GraphQLError com code CONFLICT / BAD_USER_INPUT
      return rest.post('/pedidos', corpo);
    },

    cancelarPedido: (parent, { id }, { rest }) =>
      rest.patch(`/pedidos/${idNumerico(id, 'id')}`, { status: 'CANCELADO' }),
  },
};

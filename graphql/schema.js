// schema.js — o contrato GraphQL do WarHouse (Tutorial de GraphQL, Passo 2)
export const typeDefs = `#graphql
  "Categoria do jogo de tabuleiro"
  enum Categoria {
    ESTRATEGIA
    FAMILIA
    PARTY
    COOPERATIVO
    CARTAS
  }

  enum TipoPedido {
    ALUGUEL
    COMPRA
  }

  "Ciclo de vida do pedido (máquina de estados da API REST)"
  enum StatusPedido {
    CRIADO
    PAGO
    ENVIADO
    CONCLUIDO
    CANCELADO
  }

  "Um jogo do catálogo"
  type Jogo {
    id: ID!
    nome: String!
    categoria: Categoria!
    minJogadores: Int!
    maxJogadores: Int!
    idadeMinima: Int!
    precoVenda: Float!
    precoAluguelDia: Float!
    exemplaresDisponiveis: Int!
    disponivel: Boolean!
    "Texto pronto para a tela, ex.: '3 a 4 jogadores'"
    jogadores: String!
  }

  "Um item do pedido: o jogo e a quantidade"
  type ItemPedido {
    quantidade: Int!
    "Pode vir null se o jogo não puder ser carregado (resposta parcial)"
    jogo: Jogo
  }

  "Um pedido de aluguel ou de compra"
  type Pedido {
    id: ID!
    tipo: TipoPedido!
    status: StatusPedido!
    itens: [ItemPedido!]!
    dataInicio: String
    dataFim: String
    dias: Int
    valorTotal: Float!
    criadoEm: String!
    atualizadoEm: String!
  }

  "Resumo da conta exibido no topo da tela 'Meus pedidos'"
  type ResumoPedidos {
    total: Int!
    alugueisAtivos: Int!
    valorTotal: Float!
  }

  input ItemPedidoInput {
    jogoId: ID!
    quantidade: Int!
  }

  "Dados para criar um pedido. dataInicio (AAAA-MM-DD) e dias são obrigatórios no aluguel."
  input NovoPedidoInput {
    tipo: TipoPedido!
    email: String!
    itens: [ItemPedidoInput!]!
    dataInicio: String
    dias: Int
  }

  type Query {
    "Catálogo com filtros (argumentos opcionais)"
    jogos(categoria: Categoria, busca: String, apenasDisponiveis: Boolean, limite: Int = 10): [Jogo!]!
    jogo(id: ID!): Jogo
    "Pedidos do cliente autenticado (o gateway informa quem é)"
    meusPedidos(status: StatusPedido, tipo: TipoPedido): [Pedido!]!
    pedido(id: ID!): Pedido
    resumoPedidos: ResumoPedidos!
  }

  type Mutation {
    criarPedido(dados: NovoPedidoInput!): Pedido!
    cancelarPedido(id: ID!): Pedido!
  }
`;

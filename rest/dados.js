// dados.js — "banco de dados" em memória do WarHouse.
// criarBanco() devolve um banco NOVO a cada chamada (os testes automatizados usam isso).

// Valores fixos (enums) do domínio
export const CATEGORIAS = ['ESTRATEGIA', 'FAMILIA', 'PARTY', 'COOPERATIVO', 'CARTAS'];
export const TIPOS_PEDIDO = ['ALUGUEL', 'COMPRA'];
export const STATUS_PEDIDO = ['CRIADO', 'PAGO', 'ENVIADO', 'CONCLUIDO', 'CANCELADO'];

// Datas sempre em UTC (restrição EARS 3 da Entrega 2)
const hoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (data, dias) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export function criarBanco() {
  const jogos = [
    { id: 1, nome: 'Catan', categoria: 'ESTRATEGIA', minJogadores: 3, maxJogadores: 4, idadeMinima: 10, precoVenda: 329.9, precoAluguelDia: 19.9, exemplaresDisponiveis: 3 },
    { id: 2, nome: 'Ticket to Ride', categoria: 'FAMILIA', minJogadores: 2, maxJogadores: 5, idadeMinima: 8, precoVenda: 349.9, precoAluguelDia: 19.9, exemplaresDisponiveis: 2 },
    { id: 3, nome: 'Dixit', categoria: 'PARTY', minJogadores: 3, maxJogadores: 8, idadeMinima: 8, precoVenda: 249.9, precoAluguelDia: 14.9, exemplaresDisponiveis: 4 },
    { id: 4, nome: 'Pandemic', categoria: 'COOPERATIVO', minJogadores: 2, maxJogadores: 4, idadeMinima: 8, precoVenda: 299.9, precoAluguelDia: 17.9, exemplaresDisponiveis: 1 },
    { id: 5, nome: 'Azul', categoria: 'FAMILIA', minJogadores: 2, maxJogadores: 4, idadeMinima: 8, precoVenda: 279.9, precoAluguelDia: 15.9, exemplaresDisponiveis: 2 },
    { id: 6, nome: 'Exploding Kittens', categoria: 'CARTAS', minJogadores: 2, maxJogadores: 5, idadeMinima: 7, precoVenda: 129.9, precoAluguelDia: 9.9, exemplaresDisponiveis: 0 },
    { id: 7, nome: 'War', categoria: 'ESTRATEGIA', minJogadores: 3, maxJogadores: 6, idadeMinima: 10, precoVenda: 199.9, precoAluguelDia: 12.9, exemplaresDisponiveis: 2 },
    { id: 8, nome: 'Codenames', categoria: 'PARTY', minJogadores: 2, maxJogadores: 8, idadeMinima: 10, precoVenda: 159.9, precoAluguelDia: 9.9, exemplaresDisponiveis: 3 },
  ];

  const agora = new Date().toISOString();
  const pedidos = [
    {
      id: 1, clienteId: 'app-cliente', email: 'bruna@exemplo.test', tipo: 'ALUGUEL', status: 'PAGO',
      itens: [{ jogoId: 1, quantidade: 1 }, { jogoId: 3, quantidade: 1 }],
      dataInicio: somarDias(hoje(), 1), dataFim: somarDias(hoje(), 4), dias: 3,
      valorTotal: 104.4, criadoEm: agora, atualizadoEm: agora,
    },
    {
      id: 2, clienteId: 'parceiro-ludoteca', email: 'compras@ludoteca.test', tipo: 'COMPRA', status: 'ENVIADO',
      itens: [{ jogoId: 2, quantidade: 2 }],
      dataInicio: null, dataFim: null, dias: null,
      valorTotal: 699.8, criadoEm: agora, atualizadoEm: agora,
    },
    {
      id: 3, clienteId: 'app-cliente', email: 'bruna@exemplo.test', tipo: 'COMPRA', status: 'CRIADO',
      itens: [{ jogoId: 8, quantidade: 1 }, { jogoId: 4, quantidade: 1 }],
      dataInicio: null, dataFim: null, dias: null,
      valorTotal: 459.8, criadoEm: agora, atualizadoEm: agora,
    },
  ];

  return { jogos, pedidos, proximoJogoId: 9, proximoPedidoId: 4 };
}

export { hoje, somarDias };

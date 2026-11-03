// cena5-graphql.js — Cena 5: a tela "Meus pedidos" do app em UMA consulta GraphQL.
// Mostra o resultado e compara: quantas chamadas REST o app faria sem o GraphQL,
// e quantas o servidor GraphQL fez por dentro (com DataLoader, que agrupa os jogos).
import { GATEWAY, CHAVES } from './util.js';

const CONSULTA = `
  query MeusPedidos($status: StatusPedido) {
    resumoPedidos { total alugueisAtivos valorTotal }
    meusPedidos(status: $status) {
      id tipo status valorTotal dataInicio dataFim
      itens {
        quantidade
        jogo { nome categoria jogadores }
      }
    }
    sugestoes: jogos(categoria: ESTRATEGIA, apenasDisponiveis: true, limite: 3) {
      nome precoAluguelDia
    }
  }
`;

const resposta = await fetch(`${GATEWAY}/api/graphql`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': CHAVES.cliente },
  body: JSON.stringify({ query: CONSULTA, operationName: 'MeusPedidos' }),
});
const { data, errors, extensions } = await resposta.json();
console.log(`== Cena 5: tela "Meus pedidos" (POST /api/graphql -> ${resposta.status}) ==`);
console.log(`X-Request-Id: ${resposta.headers.get('x-request-id')}`);
if (errors) {
  console.log('Erros GraphQL:', errors.map((e) => `${e.extensions?.code}: ${e.message}`).join('; '));
  process.exit(1);
}

const r = data.resumoPedidos;
console.log(`\nResumo: ${r.total} pedidos, ${r.alugueisAtivos} aluguel(éis) ativo(s), R$ ${r.valorTotal.toFixed(2)}`);
for (const p of data.meusPedidos) {
  const itens = p.itens.map((i) => `${i.quantidade}x ${i.jogo?.nome ?? '?'} (${i.jogo?.jogadores ?? '-'})`).join(', ');
  const periodo = p.tipo === 'ALUGUEL' ? ` ${p.dataInicio} a ${p.dataFim}` : '';
  console.log(`  #${p.id} ${p.tipo.padEnd(7)} ${p.status.padEnd(9)} R$ ${p.valorTotal.toFixed(2).padStart(7)}${periodo} | ${itens}`);
}
console.log(`Sugestões: ${data.sugestoes.map((j) => `${j.nome} (R$ ${j.precoAluguelDia}/dia)`).join(', ')}`);

// Quantas chamadas o app faria em REST para montar a mesma tela:
// 1 GET /pedidos + 1 GET /jogos/:id por jogo diferente + 1 GET /jogos?categoria=... (sugestões)
const jogosDistintos = new Set(data.meusPedidos.flatMap((p) => p.itens.map((i) => i.jogo?.nome))).size;
const semGraphql = 1 + jogosDistintos + 1;
console.log(`
Comparação:
  - o app fez 1 chamada (esta consulta GraphQL);
  - em REST, a mesma tela exigiria ${semGraphql} chamadas pela internet (1 de pedidos + ${jogosDistintos} de jogos + 1 de sugestões);
  - por dentro, o servidor GraphQL fez ${extensions?.chamadasRest} chamadas REST na rede interna (DataLoader agrupou os ${jogosDistintos} jogos em 1).
  -> ${semGraphql - 1} chamadas a menos para o app.`);

// cena7-painel.js — Cena 7: rota agregada /api/painel/pedidos/:id (tela "acompanhar pedido").
// Junta o pedido e os jogos (API REST) com a situação da entrega (Logística).
// Uso: node cena7-painel.js [id]      (padrão: pedido 1)
//   1ª vez: com tudo no ar -> resposta completa, "parcial": false
//   depois: "parar logistica" no npm run tudo e rode de novo -> "entrega": null, "parcial": true
import { chamar, CHAVES } from './util.js';

const id = process.argv[2] ?? '1';
console.log(`== Cena 7: GET /api/painel/pedidos/${id} (app-cliente) ==`);
const r = await chamar('GET', `/api/painel/pedidos/${id}`, { chave: CHAVES.cliente });
console.log(JSON.stringify(r.dados, null, 2));
if (r.status === 200) {
  console.log(r.dados.parcial
    ? `\nResposta PARCIAL: indisponível(is) = ${r.dados.indisponiveis.join(', ')}. O pedido continua visível (degradação graciosa).`
    : '\nResposta COMPLETA: pedido + jogos (API REST) + entrega (Logística) em 1 chamada.');
}

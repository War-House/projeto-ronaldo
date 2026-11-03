// cliente.js — evidência da Parte 1: cria, lê, altera e remove um jogo e provoca erros de propósito.
// Rode com: node cliente.js   (com a API REST ligada em outro terminal)
//
// Chama a API REST DIRETO (127.0.0.1:3001), simulando os cabeçalhos que o gateway enviaria.
// Para passar pelo gateway, use: BASE=http://localhost:3000/api node cliente.js
const BASE = process.env.BASE ?? 'http://127.0.0.1:3001';
const PELO_GATEWAY = BASE.endsWith('/api');

// Direto na API: o "gateway" somos nós (identidade do painel administrativo).
// Pelo gateway: a chave de API fictícia do painel administrativo.
const CABECALHOS = PELO_GATEWAY
  ? { 'X-API-Key': 'chave-painel-admin-456' }
  : { 'X-Cliente-Id': 'painel-admin', 'X-Cliente-Perfil': 'ADMIN' };

async function api(metodo, caminho, corpo, extras = {}) {
  const resposta = await fetch(BASE + caminho, {
    method: metodo,
    headers: { ...CABECALHOS, ...extras, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const linha = `${metodo} ${caminho} -> ${resposta.status}`;
  if (resposta.status === 204) { console.log(linha); return null; }

  const dados = await resposta.json();
  if (!resposta.ok) {
    // Aqui "dados" é um Problem Details (RFC 9457)
    const erro = new Error(`${linha} ${dados.title}: ${dados.detail}`);
    erro.problema = dados;
    throw erro;
  }
  console.log(linha + (resposta.headers.get('location') ? ` (Location: ${resposta.headers.get('location')})` : ''));
  return dados;
}

console.log('== 1. Criar um jogo (201 + Location)');
const criado = await api('POST', '/jogos', {
  nome: 'Carcassonne', categoria: 'FAMILIA', minJogadores: 2, maxJogadores: 5,
  idadeMinima: 7, precoVenda: 239.9, precoAluguelDia: 13.9, exemplaresDisponiveis: 2,
});
console.log('   criado:', criado);

console.log('== 2. Ler');
console.log('   lido:', await api('GET', `/jogos/${criado.id}`));

console.log('== 3. Alterar parcialmente (PATCH) e substituir (PUT)');
console.log('   alterado:', await api('PATCH', `/jogos/${criado.id}`, { exemplaresDisponiveis: 4 }));
await api('PUT', `/jogos/${criado.id}`, {
  nome: 'Carcassonne (2ª edição)', categoria: 'FAMILIA', minJogadores: 2, maxJogadores: 5,
  idadeMinima: 7, precoVenda: 249.9, precoAluguelDia: 13.9, exemplaresDisponiveis: 4,
});

console.log('== 4. Listar: jogos de estratégia disponíveis, do mais barato ao mais caro (filtro + ordenação + paginação)');
const pagina = await api('GET', '/jogos?categoria=ESTRATEGIA&disponivel=true&ordenar=precoVenda&ordem=asc&limite=2');
for (const jogo of pagina.dados) console.log(`   R$ ${jogo.precoVenda.toFixed(2)} - ${jogo.nome}`);
console.log('  ', pagina.paginacao);

console.log('== 5. Remover (204)');
await api('DELETE', `/jogos/${criado.id}`);

console.log('== 6. Erros provocados de propósito');
const tentativas = [
  ['GET', `/jogos/${criado.id}`],                                    // 404: acabou de ser removido
  ['GET', '/jogos?categoria=RPG'],                                    // 400: enum inexistente
  ['POST', '/jogos', { nome: 'X', categoria: 'PARTY', minJogadores: 6, maxJogadores: 2 }], // 422
  ['DELETE', '/jogos/1'],                                             // 409: R4, Catan tem histórico
  ['POST', '/pedidos', { tipo: 'COMPRA', email: 'ana@exemplo.test', itens: [{ jogoId: 6, quantidade: 1 }] }], // 409: R1
  ['POST', '/pedidos', { tipo: 'ALUGUEL', email: 'ana@exemplo.test', dataInicio: '2020-01-10', dias: 3,
    itens: [{ jogoId: 1, quantidade: 1 }] }],                         // 422: R2, data no passado
];
for (const [metodo, caminho, corpo] of tentativas) {
  try {
    await api(metodo, caminho, corpo);
  } catch (erro) {
    console.log('   Erro esperado ->', erro.message);
    if (erro.problema.erros) console.log('     campos:', erro.problema.erros.map((e) => `${e.campo} (${e.mensagem})`).join('; '));
  }
}

// cena2-rest.js — Cena 2: API REST pelo gateway.
// Cria um aluguel (201 com Location), lê o registro e provoca as regras de negócio do tema.
import { chamar, CHAVES, amanha } from './util.js';

console.log('== Cena 2: API REST pelo gateway (cliente: app-cliente) ==');

const criado = await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'ALUGUEL', email: 'marina@exemplo.test', dataInicio: amanha(), dias: 3,
    itens: [{ jogoId: 7, quantidade: 1 }, { jogoId: 3, quantidade: 1 }] },
});
console.log('   corpo:', JSON.stringify(criado.dados));

const local = criado.cabecalhos.get('location'); // ex.: /api/pedidos/7 (reescrito pelo gateway)
const lido = await chamar('GET', local, { chave: CHAVES.cliente });
console.log(`   pedido #${lido.dados.id}: ${lido.dados.tipo} ${lido.dados.status}, ${lido.dados.dataInicio} a ${lido.dados.dataFim}, R$ ${lido.dados.valorTotal}`);

console.log('\n-- Regras de negócio do WarHouse --');
// R1 (409): Exploding Kittens está com estoque zero (ASR 1, sem overbooking)
await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'COMPRA', email: 'marina@exemplo.test', itens: [{ jogoId: 6, quantidade: 1 }] },
});
// R2 (422): aluguel começando no passado
await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'ALUGUEL', email: 'marina@exemplo.test', dataInicio: '2026-01-10', dias: 2,
    itens: [{ jogoId: 1, quantidade: 1 }] },
});
// R3 (422): aluguel de 45 dias (máximo 30)
await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'ALUGUEL', email: 'marina@exemplo.test', dataInicio: amanha(), dias: 45,
    itens: [{ jogoId: 1, quantidade: 1 }] },
});
// R4 (409): excluir um jogo com histórico de pedidos (só o painel admin pode tentar)
await chamar('DELETE', '/api/jogos/1', { chave: CHAVES.admin });
// R5 (409): o pedido 2 já foi ENVIADO e não pode mais ser cancelado
await chamar('PATCH', '/api/pedidos/2', { chave: CHAVES.admin, corpo: { status: 'CANCELADO' } });
// Validação de entrada (422 com a lista de campos) e parâmetro inválido (400)
await chamar('POST', '/api/pedidos', { chave: CHAVES.cliente, corpo: { tipo: 'TROCA', itens: [] } });
await chamar('GET', '/api/jogos?categoria=RPG', { chave: CHAVES.cliente });

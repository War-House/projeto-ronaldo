// cena8-rastreio.js — Cena 8: o mesmo X-Request-Id no gateway, na API REST e nos consumidores.
// Cria um aluguel pelo gateway, espera os consumidores e procura o identificador no registro
// de auditoria (mensageria/auditoria.log). No terminal do "npm run tudo", o mesmo id aparece
// nas linhas do gateway, da API (rest e outbox), da notificação, da logística e da auditoria.
import { readFileSync, existsSync } from 'node:fs';
import { chamar, CHAVES, amanha, esperar } from './util.js';

console.log('== Cena 8: rastreamento ponta a ponta ==');
const r = await chamar('POST', '/api/pedidos', {
  chave: CHAVES.cliente,
  corpo: { tipo: 'ALUGUEL', email: 'joao@exemplo.test', dataInicio: amanha(), dias: 2,
    itens: [{ jogoId: 8, quantidade: 1 }] },
});
const id = r.requestId;
console.log(`\nProcure este identificador nos logs: ${id}`);
console.log('Aguardando os consumidores (2 s)...');
await esperar(2000);

const arquivo = new URL('../mensageria/auditoria.log', import.meta.url);
if (existsSync(arquivo)) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n').filter((l) => l.includes(id));
  console.log(`\nauditoria.log (gravado pelo consumidor de auditoria) - ${linhas.length} linha(s) com ${id}:`);
  for (const l of linhas) console.log('  ' + l);
}
console.log(`\nNo Windows (PowerShell), com logs em arquivo: Select-String -Path *.log -Pattern ${id}`);
console.log(`No Linux/macOS: grep ${id} *.log`);

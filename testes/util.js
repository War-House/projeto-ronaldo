// util.js — funções comuns aos roteiros da demonstração (só usam fetch: nada a instalar)
export const GATEWAY = process.env.GATEWAY ?? 'http://localhost:3000';

// Chaves FICTÍCIAS dos três atores (as mesmas do gateway/app.js)
export const CHAVES = {
  cliente: 'chave-app-cliente-123',       // aplicativo do cliente: 30 req/min
  admin: 'chave-painel-admin-456',        // painel administrativo: 120 req/min
  parceiro: 'chave-parceiro-ludoteca-789', // ludoteca parceira: 10 req/min, só catálogo e pedidos
};

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Data de amanhã (UTC), para os aluguéis
export const amanha = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Faz a chamada pelo gateway e imprime: método, caminho, status, X-Request-Id e o resumo do corpo. */
export async function chamar(metodo, caminho, { chave, corpo, mostrar = true, cabecalhos = {} } = {}) {
  const resposta = await fetch(GATEWAY + caminho, {
    method: metodo,
    headers: {
      ...(chave ? { 'X-API-Key': chave } : {}),
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...cabecalhos,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  const requestId = resposta.headers.get('x-request-id');
  if (mostrar) {
    const extras = ['location', 'retry-after', 'x-ratelimit-remaining']
      .filter((h) => resposta.headers.get(h))
      .map((h) => `${h}: ${resposta.headers.get(h)}`).join(' | ');
    console.log(`\n${metodo} ${caminho} -> ${resposta.status}${extras ? `  [${extras}]` : ''}`);
    console.log(`   X-Request-Id: ${requestId}`);
    if (dados?.title) console.log(`   Problem Details: ${dados.status} ${dados.title} - ${dados.detail}`);
    if (dados?.erros) console.log(`   erros: ${dados.erros.map((e) => `${e.campo} (${e.mensagem})`).join('; ')}`);
  }
  return { status: resposta.status, dados, requestId, cabecalhos: resposta.headers };
}

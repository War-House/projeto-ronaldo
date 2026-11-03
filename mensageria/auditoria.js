// auditoria.js — Consumidor 3 (extra): registro de auditoria de TODOS os eventos ("#").
// Corresponde ao componente "Registrar Auditoria" do C4 nível 3 e à restrição EARS 8
// (nenhum aluguel sem identificador do cliente e carimbos de data/hora em UTC).
//
// Aqui a idempotência é DURÁVEL: os eventoId já gravados são relidos do arquivo ao iniciar,
// então nem um reinício do consumidor faz o mesmo evento ser registrado duas vezes.
// (Em produção: tabela no banco com chave única em eventoId.)
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { prepararFila, consumir } from './comum.js';

const SISTEMA = 'auditoria';
const FILA = 'warhouse.auditoria';
const ARQUIVO = new URL('./auditoria.log', import.meta.url);

const gravados = new Set();
if (existsSync(ARQUIVO)) {
  for (const linha of readFileSync(ARQUIVO, 'utf8').split('\n').filter(Boolean)) {
    try { gravados.add(JSON.parse(linha).eventoId); } catch { /* linha corrompida: ignora */ }
  }
  console.log(`[${SISTEMA}] ${gravados.size} evento(s) já registrados em auditoria.log`);
}

async function registrar(evento, msg, { requestId, chave }) {
  const linha = {
    eventoId: evento.eventoId,
    tipo: chave,
    requestId,
    clienteId: evento.dados?.pedido?.clienteId ?? null,
    pedidoId: evento.dados?.pedido?.id ?? null,
    ocorridoEm: evento.ocorridoEm,       // UTC, vindo da API
    registradoEm: new Date().toISOString(), // UTC
  };
  appendFileSync(ARQUIVO, JSON.stringify(linha) + '\n');
  console.log(`${requestId} [${SISTEMA}] registrado ${chave} (eventoId ${evento.eventoId})`);
}

const { canal } = await prepararFila({ fila: FILA });
await consumir({
  canal, fila: FILA, sistema: SISTEMA, processar: registrar,
  jaProcessado: (id) => gravados.has(id),
  marcarProcessado: (id) => gravados.add(id),
});

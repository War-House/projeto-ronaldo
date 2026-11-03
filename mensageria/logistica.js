// logistica.js — Consumidor 2: separação e rastreamento das entregas.
// Recebe SÓ PARTE dos eventos de pedido (não recebe "concluido" nem os eventos de jogo):
//   pedido.*.criado     -> exemplares reservados, aguardando pagamento
//   pedido.*.pago       -> entra em separação
//   pedido.*.enviado    -> em transporte, com código de rastreio
//   pedido.*.cancelado  -> separação cancelada
//
// Além de consumir, expõe a situação da entrega em HTTP (só em 127.0.0.1:3003), usada pela
// rota agregada do gateway (/api/painel/pedidos/:id). Se este processo estiver desligado,
// o painel responde parcialmente (degradação graciosa).
import express from 'express';
import { prepararFila, consumir } from './comum.js';

const SISTEMA = 'logistica';
const FILA = 'warhouse.logistica';
const PORTA = Number(process.env.PORT ?? 3003);
const HOST = process.env.HOST ?? '127.0.0.1';

// Situação das entregas (em memória). Já começa com os pedidos de exemplo da API REST.
const agora = new Date().toISOString();
const entregas = new Map([
  [1, { pedidoId: 1, situacao: 'EM_SEPARACAO', codigoRastreio: null, atualizadoEm: agora }],
  [2, { pedidoId: 2, situacao: 'EM_TRANSPORTE', codigoRastreio: 'WH000000002BR', atualizadoEm: agora }],
  [3, { pedidoId: 3, situacao: 'AGUARDANDO_PAGAMENTO', codigoRastreio: null, atualizadoEm: agora }],
]);

const SITUACOES = {
  criado: 'AGUARDANDO_PAGAMENTO',
  pago: 'EM_SEPARACAO',
  enviado: 'EM_TRANSPORTE',
  cancelado: 'CANCELADA',
};

async function atualizarEntrega(evento, msg, { requestId, chave }) {
  const pedido = evento.dados?.pedido;
  if (!pedido?.id) throw new Error('evento sem pedido');
  const acao = chave.split('.').at(-1);
  const situacao = SITUACOES[acao];
  const entrega = {
    pedidoId: pedido.id,
    situacao,
    codigoRastreio: acao === 'enviado' ? `WH${String(pedido.id).padStart(9, '0')}BR` : entregas.get(pedido.id)?.codigoRastreio ?? null,
    atualizadoEm: new Date().toISOString(),
  };
  entregas.set(pedido.id, entrega);
  console.log(`${requestId} [${SISTEMA}] pedido #${pedido.id}: ${situacao}` +
    (acao === 'criado' ? ` (${pedido.itens.length} item(ns) reservado(s) para separação)` : ''));
}

// ---------- HTTP interno: situação da entrega ----------
const app = express();
app.disable('x-powered-by');
app.get('/saude', (req, res) => res.json({ status: 'ok', servico: 'warhouse-logistica' }));
app.get('/entregas/:pedidoId', (req, res) => {
  const requestId = req.get('x-request-id') ?? '-';
  const entrega = entregas.get(Number(req.params.pedidoId));
  console.log(`${requestId} [${SISTEMA}] GET /entregas/${req.params.pedidoId} -> ${entrega ? 200 : 404}`);
  if (!entrega) {
    return res.status(404).type('application/problem+json').json({
      type: 'about:blank', title: 'Not Found', status: 404,
      detail: 'Ainda não há entrega registrada para este pedido.', instance: req.originalUrl,
    });
  }
  res.json(entrega);
});
app.listen(PORTA, HOST, () => console.log(`[${SISTEMA}] situação das entregas em http://${HOST}:${PORTA}/entregas/:pedidoId`));

// Bindings (em comum.js): pedido.*.criado, pedido.*.pago, pedido.*.enviado, pedido.*.cancelado
const { canal } = await prepararFila({ fila: FILA });
await consumir({ canal, fila: FILA, sistema: SISTEMA, processar: atualizarEntrega });

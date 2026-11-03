// erros.js — erros no formato Problem Details (RFC 9457), como no Tutorial de API REST (Passo 5)
import { STATUS_CODES } from 'node:http';

// Identificadores de tipo: não precisam ser endereços reais
export const BASE_PROBLEMAS = 'https://warhouse.example/problemas/';

export class ErroHttp extends Error {
  constructor(status, tipo, titulo, detalhe, extras = {}) {
    super(detalhe);
    this.status = status;
    this.tipo = tipo;
    this.titulo = titulo;
    this.extras = extras;
  }
}

export const parametroInvalido = (detalhe) =>
  new ErroHttp(400, 'parametro-invalido', 'Parâmetro inválido', detalhe);

// Tratador único: as rotas só lançam ErroHttp; aqui a resposta é montada
// O Express reconhece o tratador de erros pelos 4 parâmetros (err, req, res, next)
// eslint-disable-next-line no-unused-vars
export function tratadorDeErros(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  const esperado = status < 500; // erro do cliente: explicamos; erro nosso: não vazamos detalhes

  let detalhe = err.message;
  if (err.type === 'entity.parse.failed') detalhe = 'O corpo da requisição não é um JSON válido.';
  if (!esperado) {
    console.error(req.id, err); // o detalhe real fica só no log do servidor
    detalhe = 'Ocorreu um erro inesperado. Tente novamente mais tarde.';
  }

  const identificacao = err.tipo
    ? { type: BASE_PROBLEMAS + err.tipo, title: err.titulo }
    : { type: 'about:blank', title: STATUS_CODES[status] };

  res.status(status).type('application/problem+json').json({
    ...identificacao,
    status,
    detail: detalhe,
    instance: req.originalUrl,
    requestId: req.id,
    ...(esperado ? err.extras : {}),
  });
}

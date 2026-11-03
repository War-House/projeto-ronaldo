// rest.js — os resolvers NÃO têm cópia própria dos dados: tudo vem da API REST por HTTP.
// Cada requisição GraphQL ganha um cliente REST próprio, que:
//   - repassa X-Request-Id, X-Cliente-Id e X-Cliente-Perfil recebidos do gateway;
//   - conta quantas chamadas REST a consulta fez (evidência da Parte 3);
//   - guarda as respostas GET desta requisição (duas partes da consulta que pedem o mesmo dado
//     não geram duas chamadas);
//   - traduz os Problem Details da API REST em GraphQLError com "code".
import { GraphQLError } from 'graphql';

const REST_URL = process.env.REST_URL ?? 'http://127.0.0.1:3001';
const TIMEOUT_MS = 1500; // menor que o timeout do gateway (3000 ms): timeouts decrescentes

const CODIGOS = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BAD_USER_INPUT',
};

export function criarClienteRest({ requestId, clienteId, perfil }) {
  const cacheGet = new Map();
  const cliente = {
    contagem: 0,
    chamadas: [],

    async chamar(metodo, caminho, corpo) {
      if (metodo === 'GET' && cacheGet.has(caminho)) return cacheGet.get(caminho);

      const pendente = (async () => {
        cliente.contagem++;
        cliente.chamadas.push(`${metodo} ${caminho}`);
        const cabecalhos = { 'x-request-id': requestId, accept: 'application/json' };
        if (clienteId) cabecalhos['x-cliente-id'] = clienteId;
        if (perfil) cabecalhos['x-cliente-perfil'] = perfil;
        if (corpo) cabecalhos['content-type'] = 'application/json';

        let resposta;
        try {
          resposta = await fetch(REST_URL + caminho, {
            method: metodo,
            headers: cabecalhos,
            body: corpo ? JSON.stringify(corpo) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (erro) {
          throw new GraphQLError('A API REST do WarHouse não respondeu.', {
            extensions: { code: 'REST_INDISPONIVEL', motivo: erro.name },
          });
        }
        const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
        if (!resposta.ok) {
          // dados é um Problem Details (RFC 9457) vindo da API REST
          throw new GraphQLError(dados?.detail ?? `A API REST respondeu ${resposta.status}.`, {
            extensions: {
              code: CODIGOS[resposta.status] ?? 'REST_INDISPONIVEL',
              status: resposta.status,
              tipo: dados?.type,
              ...(dados?.erros ? { erros: dados.erros } : {}),
            },
          });
        }
        return dados;
      })();

      if (metodo === 'GET') {
        cacheGet.set(caminho, pendente);
        pendente.catch(() => cacheGet.delete(caminho));
      }
      return pendente;
    },

    get: (caminho) => cliente.chamar('GET', caminho),
    post: (caminho, corpo) => cliente.chamar('POST', caminho, corpo),
    patch: (caminho, corpo) => cliente.chamar('PATCH', caminho, corpo),
  };
  return cliente;
}

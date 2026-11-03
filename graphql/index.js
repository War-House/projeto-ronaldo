// index.js — servidor GraphQL do WarHouse (Tutorial de GraphQL, Passo 4)
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { randomUUID } from 'node:crypto';
import { typeDefs } from './schema.js';
import { resolvers, criarJogoLoader } from './resolvers.js';
import { criarClienteRest } from './rest.js';

const PORTA = Number(process.env.PORT ?? 4000);
// Só a própria máquina acessa: o público chega pelo gateway em /api/graphql
const HOST = process.env.HOST ?? '127.0.0.1';

// Plugin: registra no log cada operação com o X-Request-Id e quantas chamadas REST ela fez,
// e devolve essa contagem em "extensions" (evidência da Parte 3).
const contagemDeChamadas = {
  async requestDidStart() {
    return {
      async willSendResponse({ response, contextValue, operationName }) {
        if (operationName === 'IntrospectionQuery') return;
        const { rest, requestId } = contextValue;
        if (response.body.kind === 'single') {
          response.body.singleResult.extensions = {
            ...response.body.singleResult.extensions,
            chamadasRest: rest.contagem,
            requestId,
          };
        }
        console.log(`${requestId} [graphql] operação ${operationName ?? '(anônima)'} -> ` +
          `${rest.contagem} chamada(s) REST: ${rest.chamadas.join(' | ') || '-'}`);
      },
    };
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [contagemDeChamadas],
  introspection: process.env.NODE_ENV !== 'production', // em produção, desligada (seção 7.3)
  includeStacktraceInErrorResponses: false, // nada de detalhes internos para o cliente
});

const { url } = await startStandaloneServer(server, {
  listen: { port: PORTA, host: HOST },
  // A função context lê os cabeçalhos repassados pelo gateway (lista de permissão)
  context: async ({ req }) => {
    const requestId = req.headers['x-request-id'] ?? `direto-${randomUUID()}`;
    const rest = criarClienteRest({
      requestId,
      clienteId: req.headers['x-cliente-id'],
      perfil: req.headers['x-cliente-perfil'],
    });
    return { requestId, rest, jogoLoader: criarJogoLoader(rest) };
  },
});

console.log(`Servidor GraphQL do WarHouse em ${url} (público: http://localhost:3000/api/graphql)`);

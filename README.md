# WarHouse — Projeto Fio-Condutor em funcionamento

**Grupo 04** · Modelagem de Padrões de Projeto · Tema: **WarHouse**, plataforma de aluguel e compra de jogos de tabuleiro

**Integrantes:** Ana Carolina Monteiro dos Santos · Ana Laura Amoroso do Vale · Gabriela Scattolin Ribeiro · Larissa Rodrigues · Maria Júlia Fernandes Capellato · Milena Vieira dos Santos · Sylvia Helena Galassini Santana

- Repositório Git: **https://github.com/War-House/projeto-ronaldo**


---

## 1. Tema e núcleo implementado

O WarHouse é uma plataforma que centraliza o acesso a jogos de tabuleiro: o usuário consulta um catálogo, verifica a disponibilidade de exemplares e escolhe entre **alugar** (por um período) ou **comprar**, acompanhando depois o andamento do pedido; a administração gerencia o catálogo e o estoque. Os documentos do semestre definiram 7 ASRs, com destaque para o controle de estoque sem *overbooking* (ASR 1), a segurança e o controle de acesso por perfil (ASR 4), a integridade dos pedidos (ASR 5) e o acompanhamento confiável do status (ASR 6), além das restrições EARS da Entrega 2 (datas em UTC, nenhum jogo com histórico pode ser excluído, a interface nunca acessa os dados diretamente).

Como o tema é amplo, o **núcleo** escolhido foi o fluxo que mais exercita esses ASRs: **catálogo de jogos → pedido de aluguel/compra → eventos do pedido → acompanhamento**. A API REST tem os recursos `/jogos` (CRUD completo) e `/pedidos` (com 7 regras de negócio do tema); a cada pedido criado ou alterado, ela publica um evento (`pedido.aluguel.criado`, `pedido.compra.cancelado`...) que três consumidores tratam de forma assíncrona (notificações por e-mail, logística/rastreamento e auditoria); o GraphQL monta a tela "Meus pedidos" com uma única consulta; e o API Gateway é o único ponto de entrada, com chaves para três atores (aplicativo do cliente, painel administrativo e ludoteca parceira). Ficaram fora do núcleo: pagamento real, cálculo de frete, tutoriais dos jogos e banco PostgreSQL (os dados ficam em memória).

## 2. Pré-requisitos

- **Node.js 22 ou superior** (`node --version`)
- **Docker Desktop instalado e em execução** (só para o RabbitMQ). Confira com `docker info`: deve aparecer a seção *Server*.
- Git (para clonar). No Windows, use **PowerShell** ou **Git Bash**; no PowerShell escreva `curl.exe` em vez de `curl`.

Alternativa sem instalar nada: GitHub Codespaces (*Code > Codespaces > Create codespace on main*). O ambiente instala as dependências e sobe o RabbitMQ sozinho; depois siga a partir do passo 4.

## 3. Como executar (passo a passo, na ordem)

```bash
# 1. Clonar e entrar na pasta
git clone https://github.com/War-House/projeto-ronaldo.git warhouse
cd warhouse

# 2. Instalar as dependências das 4 pastas (rest, mensageria, graphql, gateway)
npm run instalar

# 3. Subir o RabbitMQ (Docker Desktop aberto!)
npm run rabbit:up

# 4. Conferir o RabbitMQ (espere ~20 s depois do passo 3; repita se disser "ainda não está pronto")
npm run rabbit:check

# 4b. (opcional) Criar exchange, filas, bindings e DLQs para vê-los no painel antes de tudo rodar
npm run rabbit:preparar

# 5. Subir os 6 processos em um único terminal (logs coloridos por processo)
npm run tudo
```

Pronto: o sistema está no ar em **http://localhost:3000** (só o gateway). Neste terminal do `npm run tudo` é possível digitar `parar rest`, `iniciar rest`, `parar logistica`, `status` e `sair` (usado nas cenas 6 e 7). Abra **um segundo terminal** na pasta do projeto para rodar os roteiros da seção 5.

**Alternativa com um terminal por processo** (na ordem — quem é chamado sobe antes do gateway):

| # | Terminal | Comando | Porta | Quem acessa |
|---|----------|---------|-------|-------------|
| 1 | API REST | `cd rest && npm start` | 3001 | só 127.0.0.1 |
| 2 | GraphQL | `cd graphql && npm start` | 4000 | só 127.0.0.1 |
| 3 | Consumidor de notificações | `cd mensageria && npm run notificacoes` | — | — |
| 4 | Consumidor de logística (+ HTTP interno) | `cd mensageria && npm run logistica` | 3003 | só 127.0.0.1 |
| 5 | Consumidor de auditoria | `cd mensageria && npm run auditoria` | — | — |
| 6 | **API Gateway** | `cd gateway && npm start` | **3000** | **pública** (única) |
| — | RabbitMQ (Docker) | `npm run rabbit:up` | 5672 (AMQP) / 15672 (painel) | painel: guest/guest |

Para desligar: `sair` (ou Ctrl+C) no `npm run tudo` e `npm run rabbit:down`.

**Testes automatizados (extra):** `npm test` na raiz (16 testes com `node --test`; não precisam do RabbitMQ).

### Docker e RabbitMQ

O RabbitMQ roda em **Docker**, definido no `compose.yaml` da raiz (imagem oficial `rabbitmq:4-management`, com healthcheck e um volume para que filas *durable* e mensagens *persistent* sobrevivam a um reinício).

| O que | Comando | Observação |
|-------|---------|------------|
| Subir o RabbitMQ | `npm run rabbit:up` (= `docker compose up -d`) | Docker Desktop precisa estar aberto |
| Ver o contêiner | `docker compose ps` | Coluna STATUS deve mostrar `healthy` |
| Conferir portas | `npm run rabbit:check` | AMQP 5672 e painel 15672 |
| Criar a topologia | `npm run rabbit:preparar` | Exchange `warhouse.eventos` (topic), DLX `warhouse.dlx`, 3 filas e 3 DLQs |
| Ver filas e DLQs | `npm run rabbit:filas` | Mensagens prontas, consumidores e o motivo de cada mensagem morta |
| Log do broker | `npm run rabbit:logs` | Ctrl+C para sair |
| Painel web | http://localhost:15672 | usuário `guest`, senha `guest`; abas *Exchanges* e *Queues* |
| Desligar | `npm run rabbit:down` | As filas continuam no volume |
| Zerar tudo | `docker compose down -v` | Apaga filas e mensagens |

Topologia criada pelo código (os consumidores e o `rabbit:preparar` declaram; a API publica):

| Fila | Binding na exchange `warhouse.eventos` | DLQ | Consumidor |
|------|----------------------------------------|-----|------------|
| `warhouse.notificacoes` | `pedido.#` | `warhouse.notificacoes.dlq` | `mensageria/notificacoes.js` |
| `warhouse.logistica` | `pedido.*.criado`, `pedido.*.pago`, `pedido.*.enviado`, `pedido.*.cancelado` | `warhouse.logistica.dlq` | `mensageria/logistica.js` |
| `warhouse.auditoria` | `#` | `warhouse.auditoria.dlq` | `mensageria/auditoria.js` |

Eventos publicados pela API REST (chave hierárquica `entidade.tipo.acao`): `pedido.aluguel.criado`, `pedido.compra.criado`, `pedido.<tipo>.pago`, `pedido.<tipo>.enviado`, `pedido.<tipo>.concluido`, `pedido.<tipo>.cancelado`, `jogo.criado` e `jogo.estoque.esgotado`.

**Ambiente inteiro em Docker (extra):** `npm run docker:completo` (= `docker compose --profile completo up -d --build`) constrói uma imagem para cada serviço (há um `Dockerfile` em `rest/`, `graphql/`, `gateway/` e `mensageria/`) e sobe RabbitMQ, API, GraphQL, gateway e os 3 consumidores na rede interna `warhouse-interna`. Só as portas 3000 (gateway) e 15672 (painel) ficam publicadas. Para desligar: `npm run docker:parar`. Não use junto com o `npm run tudo`.

## 4. Chaves e usuários de teste (todos fictícios)

| Ator | Chave (`X-API-Key`) | Perfil | Plano | Pode usar |
|------|---------------------|--------|-------|-----------|
| Aplicativo do cliente (`app-cliente`) | `chave-app-cliente-123` | CLIENTE | 30 req/min | ler catálogo; criar, ver e cancelar os **próprios** pedidos; GraphQL; painel do pedido |
| Painel administrativo (`painel-admin`) | `chave-painel-admin-456` | ADMIN | 120 req/min | tudo, inclusive alterar o catálogo e avançar o status dos pedidos |
| Ludoteca parceira (`parceiro-ludoteca`) | `chave-parceiro-ludoteca-789` | PARCEIRO | 10 req/min | ler catálogo; criar e ver os próprios pedidos (sem GraphQL) |

- RabbitMQ: usuário `guest`, senha `guest` (padrão do Docker, só para estudo).
- E-mails de clientes nos exemplos usam o domínio reservado `exemplo.test`. Qualquer e-mail `@falha.test` simula um servidor de e-mail que recusa o envio (cena 4).
- Dados iniciais: 8 jogos (o 6, *Exploding Kittens*, está com estoque zero) e 3 pedidos (1 e 3 do `app-cliente`, 2 da ludoteca, já ENVIADO).

## 5. Roteiro da demonstração (8 cenas)

Pré-condição: RabbitMQ no ar e `npm run tudo` rodando no terminal 1. Comandos no terminal 2, na raiz do projeto.

| Cena | Comando | O que mostrar |
|------|---------|---------------|
| 1. Ambiente no ar | `status` no terminal do `npm run tudo` | Tabela de processos e portas; só o gateway em 0.0.0.0:3000, o resto em 127.0.0.1. Teste: `curl -i http://localhost:3000/saude` |
| 2. API REST pelo gateway | `npm run cena2` | `201` com `Location: /api/pedidos/N` (reescrito), leitura `200`, e as regras: `409` estoque zero, `422` aluguel no passado, `422` mais de 30 dias, `409` jogo com histórico, `409` transição inválida, `422` com lista de campos e `400` |
| 3. Evento | (olhar o terminal 1 depois da cena 2) | `[outbox] publicado pedido.aluguel.criado` e as 3 reações: notificações (e-mail), logística (reserva) e auditoria, com o mesmo X-Request-Id |
| 4. Falha e duplicidade | `npm run cena4` e depois `cd mensageria && npm run falhas && npm run filas` | E-mail `@falha.test`: tentativa 1/3, 2/3, DLQ. Mesmo evento 2x: "já processado, ignorando". Mensagem malformada direto na DLQ. Painel: http://localhost:15672 → *Queues* → `warhouse.notificacoes.dlq` |
| 5. GraphQL | `npm run cena5` | Tela "Meus pedidos" (resumo + pedidos + itens + jogo + sugestões) em **1** consulta, que substitui **8** chamadas REST; o servidor fez 3 chamadas internas (DataLoader) |
| 6. Proteções do gateway | `npm run cena6` (quando pedir, digite `parar rest` no terminal 1; depois `iniciar rest`) | `200`, `401`, `403`, `429` com `Retry-After`, `504` (serviço lento), `502` e em seguida `503` (disjuntor), recuperação para `200` |
| 7. Rota agregada | `npm run cena7`; depois `parar logistica` no terminal 1 e `npm run cena7` de novo; `iniciar logistica` | Resposta completa (`parcial: false`) e parcial (`entrega: null`, `parcial: true`, `indisponiveis: ["logistica"]`) |
| 8. Fechamento | `npm run cena8` | O mesmo X-Request-Id no gateway, na API REST (rota e outbox) e nos 3 consumidores; linha gravada em `mensageria/auditoria.log`. Mostrar o diagrama (relatório, seção 2) e 2 decisões |

> A cena 6 reinicia a API REST, e os dados em memória voltam ao estado inicial. Por isso ela vem depois das cenas 2 a 5. As saídas de uma execução completa estão em `testes/evidencias/`.

### Comandos curl prontos (corpos em `testes/curl/`)

```bash
# Catálogo (filtro, ordenação e paginação)
curl -i "http://localhost:3000/api/jogos?categoria=ESTRATEGIA&ordenar=precoVenda&ordem=desc&limite=5" -H "X-API-Key: chave-app-cliente-123"

# Criar aluguel (201 + Location)
curl -i -X POST http://localhost:3000/api/pedidos -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/novo-aluguel.json

# Regras de negócio: 409 (sem estoque) e 422 (data no passado)
curl -i -X POST http://localhost:3000/api/pedidos -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/compra-sem-estoque.json
curl -i -X POST http://localhost:3000/api/pedidos -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/aluguel-no-passado.json

# Cancelar o pedido 3 (do app-cliente) e tentar cancelar o 2 pelo painel (409: já ENVIADO)
curl -i -X PATCH http://localhost:3000/api/pedidos/3 -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/cancelar.json
curl -i -X PATCH http://localhost:3000/api/pedidos/2 -H "X-API-Key: chave-painel-admin-456" -H "Content-Type: application/json" -d @testes/curl/cancelar.json

# Cadastrar jogo: 403 para o app do cliente, 201 para o painel
curl -i -X POST http://localhost:3000/api/jogos -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/novo-jogo.json
curl -i -X POST http://localhost:3000/api/jogos -H "X-API-Key: chave-painel-admin-456" -H "Content-Type: application/json" -d @testes/curl/novo-jogo.json

# GraphQL: consulta da tela e mutation com erro tratado (CONFLICT)
curl -s -X POST http://localhost:3000/api/graphql -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/consulta-meus-pedidos.json
curl -s -X POST http://localhost:3000/api/graphql -H "X-API-Key: chave-app-cliente-123" -H "Content-Type: application/json" -d @testes/curl/mutation-criar-pedido.json

# Painel agregado e saúde do gateway (estado dos disjuntores)
curl -i http://localhost:3000/api/painel/pedidos/1 -H "X-API-Key: chave-app-cliente-123"
curl -i http://localhost:3000/saude
```

**Apollo Sandbox:** abra http://127.0.0.1:4000 (só funciona na própria máquina). Em *Headers*, acrescente `x-cliente-id: app-cliente` para as consultas de pedidos.

**Cliente da Parte 1 (evidência):** `cd rest && npm run cliente` cria, lê, altera, substitui e remove um jogo e provoca 6 erros (404, 400, 422, 409, 409, 422).

## 6. Decisões e limitações (resumo; detalhes no relatório)

| Tecnologia | Por que está no WarHouse | Sem ela |
|------------|--------------------------|---------|
| REST | Recursos naturais (`jogos`, `pedidos`), cache HTTP no catálogo, contrato OpenAPI para app, painel e parceiros | Cada cliente inventaria a integração; sem status padronizados |
| Mensageria (RabbitMQ) | Aluguel/compra interessa a notificação, logística e auditoria; a API responde `201` sem esperar (ASR 3) | Um e-mail fora do ar derrubaria o pedido; a API cresceria a cada novo interessado |
| GraphQL | A tela "Meus pedidos" junta pedidos, itens, jogos e sugestões: 1 consulta em vez de 8 | O app faria 8 chamadas ou o back-end criaria um endpoint por tela |
| API Gateway | Única porta pública, chaves por ator com planos, 401/403/429/503 num só lugar (ASR 4, restrição "interface não acessa os dados") | Cada serviço repetiria autenticação e limites, e todos ficariam expostos |

Limitações conhecidas: dados, outbox, contadores de limite e idempotência (notificações e logística) ficam em memória; o `X-Cliente-Id` repassado pelo gateway não é assinado (em produção: mTLS ou token interno); o gateway é ponto único de falha (em produção: várias cópias + Redis); consistência eventual entre o pedido e a logística; pagamento e frete não implementados.

**Extras implementados** (seção 7 do enunciado): DataLoader (N+1), padrão Outbox, autorização por rota com 403, nova tentativa com espera crescente no gateway, testes com `node --test` e `compose.yaml` com perfil completo.

## 7. Estrutura

| Pasta | Conteúdo |
|-------|----------|
| `rest/` | Parte 1: `app.js` (rotas e regras), `eventos.js` (outbox + publicação), `cliente.js` (evidência), `test/` |
| `mensageria/` | Parte 2: `comum.js` (topologia, DLQ, retry, idempotência), `notificacoes.js`, `logistica.js`, `auditoria.js`, `preparar-rabbitmq.js`, `provocar-falhas.js`, `ver-filas.js` |
| `graphql/` | Parte 3: `schema.js`, `resolvers.js` (DataLoader), `rest.js` (cliente da API REST), `index.js` |
| `gateway/` | Parte 4: `app.js` (filtros, disjuntor, agregação), `gateway.js`, `test/` |
| `testes/` | Roteiros das cenas, `teste-gateway.js`, corpos `curl/` e `evidencias/` de uma execução |
| `openapi.yaml` | Contrato da API REST (10 operações, com as respostas de erro) |
| `compose.yaml` | RabbitMQ 4 com volume e healthcheck (padrão) e ambiente completo com os Dockerfiles (perfil `completo`) |
| `scripts/` | `instalar.mjs`, `iniciar-tudo.mjs`, `rabbit-check.mjs` |

## 8. Divisão de responsabilidades

Todas participaram de todas as partes e apresentam juntas; a tabela indica a responsável principal.

| Integrante | Responsável principal por |
|------------|---------------------------|
| Ana Carolina Monteiro dos Santos | Parte 1 — API REST (`rest/`, `openapi.yaml`, `cliente.js`) |
| Larissa Rodrigues | Parte 2 — Mensageria (outbox, consumidores, DLQ, idempotência) |
| Maria Júlia Fernandes Capellato | Parte 3 — GraphQL (schema, resolvers, DataLoader) |
| Ana Laura Amoroso do Vale | Parte 4 — API Gateway e integração (`gateway/`, `scripts/`, `compose.yaml`) |
| Gabriela Scattolin Ribeiro | Parte 5 — relatório técnico, diagrama, decisões e riscos |
| Milena Vieira dos Santos | Documentação do semestre e índice (`documentacao/`, `00-indice.pdf`) |
| Sylvia Helena Galassini Santana | Testes e demonstração (`testes/`, `node --test`), slides e vídeo de reserva |

Marcos no Git: `etapa-1-rest`, `etapa-2-mensageria`, `etapa-3-graphql`, `etapa-4-gateway`, `entrega-final`.

## 9. Uso de ferramentas de IA

Usamos o **Claude (Anthropic)** como apoio para: gerar um rascunho do código das quatro partes a partir dos tutoriais da disciplina e dos documentos do semestre do WarHouse; sugerir os testes automatizados; e revisar o texto do README, do relatório e dos slides. Nos documentos das oficinas (Entrega 2), o grupo já havia declarado o uso de ChatGPT, Grok, NotebookLM e Gemini para estruturar o C4 nível 3 e revisar a escrita. Todo o código foi executado, testado e revisado pelo grupo; cada integrante estudou e sabe explicar a parte pela qual é responsável. As decisões de arquitetura (núcleo, regras de negócio, eventos, atores e planos) são do grupo e vêm dos documentos do semestre.

## 10. Referências

- Tutoriais da disciplina: *Tutorial de API REST*, *Tutorial de Mensageria*, *Tutorial de GraphQL* e *Tutorial de API Gateway* (Aula 12).
- FIELDING, R.; NOTTINGHAM, M.; RESCHKE, J. (ed.). **RFC 9110: HTTP Semantics**. IETF, 2022.
- NOTTINGHAM, M.; WILDE, E.; DALAL, S. **RFC 9457: Problem Details for HTTP APIs**. IETF, 2023.
- NOTTINGHAM, M.; FIELDING, R. **RFC 6585: Additional HTTP Status Codes**. IETF, 2012.
- OPENAPI INITIATIVE. **OpenAPI Specification** 3.1.1 / 3.2.0.
- GRAPHQL FOUNDATION. **GraphQL Specification**, September 2025 Edition; **graphql/dataloader**.
- APOLLO GRAPHQL. **Apollo Server 5 Documentation**.
- RABBITMQ. **Documentação oficial** (Consumer Prefetch, Dead Letter Exchanges, Publisher Confirms).
- OWASP. **API Security Top 10: 2023**.
- HOHPE, G.; WOOLF, B. **Enterprise Integration Patterns**. Boston: Addison-Wesley, 2003.
- RICHARDSON, C. **Microservices Patterns**. Shelter Island: Manning, 2018 (Transactional Outbox, API Gateway).
- NYGARD, M. **Release It!** 2. ed. Pragmatic Bookshelf, 2018 (Circuit Breaker).
- MAVIN, A. **EARS: Easy Approach to Requirements Syntax**. Disponível em: https://alistairmavin.com/ears/.

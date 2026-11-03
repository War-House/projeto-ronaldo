Criei o arquivo de código **warhouse-api-rest.js** com a implementação completa da **API REST do domínio WarHouse (Grupo 04)**, totalmente aderente às exigências da **Parte 1** da entrega final e aos padrões do tutorial de API REST[1][2].

O código está estruturado em **Node.js 22+ com Express 5**[3] e pronto para rodar na pasta `rest/` (porta interna `3001` em `127.0.0.1`)[4].

---

### **O que foi implementado no arquivo (** **warhouse-api-rest.js** **):**

1. **Dois Recursos do Domínio WarHouse (** **/jogos** **e** **/alugueis** **):**[2]
  * **/jogos** **:** Mapeia o catálogo de jogos de tabuleiro (com `id`, `titulo`, `categoria`, `estoque`, `precoAluguel` e `precoVenda`)[5].
  * **/alugueis** **:** Mapeia as solicitações de aluguel associadas aos clientes e jogos[5][6].
2. **CRUD Completo e Semântica HTTP:**[2][7]
  * **GET /jogos** **:** Suporta busca textual (`?busca=...`), filtro por categoria (`?categoria=...`), ordenação dinâmica (`?ordenar=...&amp;ordem=asc|desc`) e **paginação configurável com teto máximo de 50 itens**[2][8].
  * **GET /jogos/:id** **:** Retorna um jogo específico pelo ID[9].
  * **POST /jogos** **:** Cadastra um novo jogo e retorna status **201 Created com o cabeçalho** **Location**[2][7].
  * **PUT /jogos/:id** **e** **PATCH /jogos/:id** **:** Atualização total (idempotente) e alteração parcial dos campos, com proteção contra atribuição em massa (*mass assignment*)[7][10].
  * **DELETE /jogos/:id** **:** Remove um jogo e retorna **204 No Content**[2][7].
3. **3 Regras de Negócio do Domínio WarHouse:**[2][5]
  * **Regra 1 (Estoque Zero - HTTP 422 Unprocessable Content):** Recusa a confirmação do aluguel se o exemplar solicitado estiver com saldo 0 no catálogo (atendendo ao ASR 1 / restrição EARS do grupo)[2][6].
  * **Regra 2 (Período de Aluguel Inválido - HTTP 400 Bad Request):** Recusa solicitações de aluguel em que a data de devolução seja anterior ou igual à data de retirada[5].
  * **Regra 3 (Prevenção de Duplicidade - HTTP 409 Conflict):** Recusa o cadastro de um jogo com o mesmo título e categoria de um item já existente no catálogo[5][11].
  * **Regra Extra de Integridade (HTTP 409 Conflict):** Impede a exclusão física de um jogo que possua histórico de aluguel registrado[6].
4. **Padronização de Erros (RFC 9457 -** **Problem Details** **):**[2][12]
  * Todos os erros da API (400, 404, 409, 422 e 500) retornam com o cabeçalho `Content-Type: application/problem+json` e corpo estruturado com `type`, `title`, `status`, `detail`, `instance` e o cabeçalho de rastreamento **requestId** (`X-Request-Id`)[13].

---

### **Como testar a API no ambiente:**

1. Na pasta `rest/`, instale o Express (se ainda não tiver feito): `npm install express`.
2. Salve este arquivo como `rest/index.js` (ou use diretamente o arquivo disponível no seu painel Studio).
3. Inicie a API com o modo de escuta: `node --watch index.js` (ou `npm run dev`)[16].
4. Teste as chamadas via cURL ou REST Client:
  * **Listar com filtro:** `curl.exe -i "[suspicious link removed]"`[17][18]
  * **Provocar Regra 1 (Estoque Zero - HTTP 422):** Tente alugar o jogo ID 3 (`Ticket to Ride`): `curl.exe -i -X POST [suspicious link removed] -H "Content-Type: application/json" -d '{"jogoId":3,"dataRetirada":"2026-11-10","dataDevolucao":"2026-11-15"}'`[17][19]
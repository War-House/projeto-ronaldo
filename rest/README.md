# API REST WarHouse

API de catálogo de jogos e pedidos de aluguel ou compra. Requer Node.js 22
ou superior. A API REST é um serviço interno: por padrão, escuta somente em
`127.0.0.1:3001`; para acesso externo, use o gateway na porta `3000`.

Os dados de jogos e pedidos são mantidos em memória e voltam ao estado inicial
quando o servidor reinicia.

## Instalação e execução

Para instalar as dependências de todos os serviços, execute na raiz do projeto:

```bash
npm run instalar
```

Para instalar somente as dependências da API REST, execute `npm install` dentro
de `rest/`. Depois, inicie o serviço:

```bash
cd rest
npm start
```

O modo de desenvolvimento, com reinicialização automática, é:

```bash
npm run dev
```

Para verificar se o serviço está respondendo, abra outro terminal:

```bash
curl -i http://127.0.0.1:3001/saude
```

## Rotas

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/saude` | Verifica a saúde do serviço e da outbox |
| `GET` | `/jogos` | Lista e filtra jogos |
| `GET` | `/jogos/:id` | Consulta um jogo |
| `POST` | `/jogos` | Cadastra um jogo (ADMIN) |
| `PUT` | `/jogos/:id` | Substitui os dados de um jogo (ADMIN) |
| `PATCH` | `/jogos/:id` | Atualiza parcialmente um jogo (ADMIN) |
| `DELETE` | `/jogos/:id` | Remove um jogo sem pedidos associados (ADMIN) |
| `GET` | `/pedidos` | Lista os pedidos do cliente identificado |
| `GET` | `/pedidos/:id` | Consulta um pedido do cliente identificado |
| `POST` | `/pedidos` | Cria um pedido de aluguel ou compra |
| `PATCH` | `/pedidos/:id` | Atualiza o status de um pedido |

### Consultar jogos

`GET /jogos` aceita `busca`, `categoria`, `disponivel`, `ids`, `ordenar`,
`ordem`, `pagina` e `limite`. A ordenação padrão é `id` crescente; a página
padrão é `1`; o limite padrão é `10`, com máximo de `50`.

```bash
curl -i "http://127.0.0.1:3001/jogos?categoria=FAMILIA&disponivel=true"
```

A resposta inclui a lista em `dados` e os metadados em `paginacao`.

### Criar um pedido

Para testar diretamente a API local, informe a identidade que normalmente é
repassada pelo gateway. O jogo `6` começa sem exemplares disponíveis; a
solicitação abaixo deve retornar `409 Conflict`:

```bash
curl -i -X POST http://127.0.0.1:3001/pedidos \
  -H "Content-Type: application/json" \
  -H "X-Cliente-Id: app-cliente" \
  -H "X-Cliente-Perfil: CLIENTE" \
  -d '{"tipo":"COMPRA","email":"teste@exemplo.test","itens":[{"jogoId":6,"quantidade":1}]}'
```

Para testar um pedido aceito, substitua `jogoId` por `5` (Azul), que tem
estoque disponível:

```bash
curl -i -X POST http://127.0.0.1:3001/pedidos \
  -H "Content-Type: application/json" \
  -H "X-Cliente-Id: app-cliente" \
  -H "X-Cliente-Perfil: CLIENTE" \
  -d '{"tipo":"COMPRA","email":"teste@exemplo.test","itens":[{"jogoId":5,"quantidade":1}]}'
```

Para um pedido do tipo `ALUGUEL`, inclua também `dataInicio` (`AAAA-MM-DD`) e
`dias` (de `1` a `30`). A data não pode estar no passado.

> Os cabeçalhos `X-Cliente-Id` e `X-Cliente-Perfil` são confiáveis somente para
> testes locais: a API espera que o gateway autentique o cliente e os repasse.
> Não exponha a porta `3001` diretamente à rede.

## Permissões e erros

- Consultar jogos é público na API interna; alterar o catálogo requer perfil
  `ADMIN`.
- Pedidos exigem uma identidade (`X-Cliente-Id`); clientes só acessam os
  próprios pedidos.
- Erros usam `application/problem+json`. Entre os status possíveis estão
  `400` (parâmetro inválido), `401` (sem identidade), `403` (sem permissão),
  `404` (recurso não encontrado), `409` (conflito de regra de negócio) e
  `422` (dados inválidos).

## Testes

Na raiz do projeto, execute a suíte completa:

```bash
npm test
```

Ou, dentro de `rest/`, execute somente os testes da API:

```bash
npm test
```

Os testes da API não precisam do RabbitMQ.

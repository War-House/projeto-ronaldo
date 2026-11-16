# Parte 4 — Falha e Duplicidade | WarHouse

## 1. Objetivo

Esta etapa demonstra como o sistema WarHouse trata falhas durante o processamento de mensagens e evita que eventos duplicados provoquem efeitos repetidos.

A implementação utiliza o RabbitMQ para permitir novas tentativas de processamento, encaminhar mensagens problemáticas para filas específicas de falhas (DLQ) e identificar eventos que já foram processados.

O objetivo é garantir maior confiabilidade ao processamento assíncrono, evitando que uma falha em determinado consumidor interrompa as atividades dos demais.

## 2. Tratamento de falhas (Retry)

O mecanismo de Retry permite que o consumidor tente processar novamente uma mensagem quando ocorre uma falha temporária.

No WarHouse, o limite configurado é de três tentativas, com tempo de espera crescente:

- Primeira tentativa: espera de 1 segundo após a falha.
- Segunda tentativa: espera de 2 segundos após a falha.
- Terceira tentativa: se falhar novamente, a mensagem é encaminhada para a DLQ.

O controle é implementado no arquivo `mensageria/comum.js`, por meio da função `consumir()`.

O arquivo `mensageria/notificacoes.js` utiliza uma simulação de falha: endereços terminados em `@falha.test` provocam a recusa do envio de e-mail.

Dessa forma, é possível demonstrar o funcionamento das novas tentativas sem depender de um servidor de e-mail real.

## 3. Dead Letter Queue (DLQ)

A Dead Letter Queue é uma fila destinada às mensagens que não puderam ser processadas normalmente.

No WarHouse, cada consumidor possui sua própria DLQ:

| Fila principal | Fila de falhas |
|---|---|
| warhouse.notificacoes | warhouse.notificacoes.dlq |
| warhouse.logistica | warhouse.logistica.dlq |
| warhouse.auditoria | warhouse.auditoria.dlq |

O encaminhamento acontece quando o consumidor rejeita uma mensagem sem solicitar que ela volte à fila principal (`nack` com `requeue: false`).

As mensagens podem chegar à DLQ após esgotar as tentativas, apresentar erros permanentes ou possuir conteúdo malformado.

A separação permite analisar mensagens problemáticas sem prejudicar o processamento das demais.

## 4. Idempotência e prevenção de duplicidade

Idempotência é a capacidade de impedir que o recebimento repetido de uma mesma mensagem provoque efeitos duplicados.

No WarHouse, cada evento possui um identificador único (`eventoId`), utilizado pelos consumidores para verificar se ele já foi processado.

O funcionamento é:

1. O consumidor recebe o evento.
2. Verifica seu identificador.
3. Se for um evento novo, realiza o processamento e registra o identificador.
4. Se o evento já tiver sido processado, ignora a repetição e confirma a mensagem com ACK.

O controle é implementado na função `consumir()`, em `mensageria/comum.js`.

Nos consumidores de notificações e logística, os identificadores são mantidos em memória. No consumidor de auditoria, os registros são armazenados no arquivo `mensageria/auditoria.log` e recuperados quando o consumidor inicia novamente.

## 5. Confirmação das mensagens

O sistema utiliza confirmação manual de mensagens (`noAck: false`).

- ACK: confirma que o processamento foi concluído.
- NACK: informa que a mensagem não foi processada corretamente.
- Requeue: permite solicitar que uma mensagem volte à fila, conforme a estratégia utilizada.

O prefetch está configurado com valor 1, limitando a quantidade de mensagens não confirmadas entregues ao consumidor.

## 6. Pasta de testes do GitHub

A pasta `testes/` contém scripts utilizados para executar e demonstrar os cenários do projeto.

Para a Cena 4, destaca-se o arquivo:

**`testes/cena4-falha.js`**

Esse script cria um pedido de compra utilizando um e-mail terminado em `@falha.test`, provocando uma falha simulada no consumidor de notificações.

A pasta `mensageria/` também contém scripts diretamente relacionados aos testes:

- `provocar-falhas.js`: publica o mesmo evento duas vezes e uma mensagem malformada.
- `ver-filas.js`: consulta as filas principais e as DLQs, apresentando informações das mensagens.
- `comum.js`: concentra a lógica compartilhada de Retry, DLQ e idempotência.

### Comandos de execução

Na raiz do projeto:

```bash
npm run cena4
```

Na pasta `mensageria/`:

```bash
npm run falhas
npm run filas
```

### Resultados esperados

**Teste de falha:**
- O consumidor tenta enviar um e-mail para o domínio `falha.test`.
- O envio é recusado.
- São realizadas três tentativas.
- A mensagem é encaminhada para `warhouse.notificacoes.dlq`.

**Teste de duplicidade:**
- O mesmo evento é publicado duas vezes com o mesmo identificador.
- O consumidor processa o evento pela primeira vez.
- Na segunda entrega, identifica que já foi processado e ignora a repetição.

**Teste de mensagem malformada:**
- Uma mensagem com conteúdo inválido é publicada.
- O consumidor identifica que não é um JSON válido.
- A mensagem é encaminhada diretamente para a DLQ.

## 7. Limitações conhecidas

Na versão atual, o controle de idempotência dos consumidores de notificações e logística é realizado em memória. Portanto, os identificadores podem ser perdidos quando esses processos são reiniciados.

O consumidor de auditoria possui uma persistência adicional em arquivo (`auditoria.log`), permitindo recuperar os identificadores registrados após uma reinicialização.

Em uma versão de produção, recomenda-se utilizar armazenamento persistente com restrição de unicidade para os identificadores dos eventos, garantindo maior confiabilidade no controle de duplicidade.

## 8. Resultado

Os mecanismos implementados demonstram como o WarHouse pode lidar com falhas temporárias, limitar novas tentativas, separar mensagens problemáticas e impedir efeitos duplicados.

Com os testes disponíveis, é possível visualizar esses comportamentos na prática, acompanhar os logs dos consumidores e verificar as mensagens encaminhadas às DLQs pelo painel do RabbitMQ.


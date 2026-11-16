# Parte 3 — Eventos (Mensageria)

## Objetivo

A parte de mensageria do projeto WarHouse utiliza o RabbitMQ para realizar a comunicação entre diferentes partes do sistema por meio de eventos. O objetivo é permitir que determinadas ações, como a criação, o pagamento, o envio ou o cancelamento de um pedido, sejam comunicadas aos serviços responsáveis sem que todos precisem executar suas tarefas ao mesmo tempo.
Dessa forma, quando um evento é publicado, os serviços interessados podem recebê-lo e realizar suas atividades de maneira independente e assíncrona.

## Funcionamento da mensageria

O sistema utiliza uma exchange do tipo `Topic`, chamada `warhouse.eventos`, responsável por receber os eventos publicados e encaminhá-los para as filas de acordo com os padrões de roteamento configurados.

Cada fila possui uma finalidade específica. Assim, um mesmo evento pode ser recebido por diferentes consumidores, dependendo do tipo de informação que ele representa e da atividade que precisa ser executada.

O projeto possui três consumidores principais: notificações, logística e auditoria.

## Arquivos da mensageria

O arquivo `comum.js` reúne funções compartilhadas pelos consumidores. Ele é responsável por centralizar a conexão com o RabbitMQ e disponibilizar recursos utilizados no processamento das mensagens.

O arquivo `preparar-rabbitmq.js` realiza a configuração inicial da estrutura de mensageria. Ele cria as exchanges e filas necessárias e estabelece as ligações entre elas, definindo quais tipos de eventos devem ser encaminhados para cada consumidor.

O arquivo `notificacoes.js` é responsável por receber eventos relacionados aos pedidos e simular o envio de notificações por e-mail. Dessa forma, quando um evento correspondente é recebido, o consumidor executa a ação de notificação.

O arquivo `logistica.js` recebe eventos específicos relacionados ao andamento dos pedidos. Sua função é acompanhar as mudanças de situação, como criação, pagamento, envio e cancelamento, mantendo informações sobre as entregas. Esse arquivo também disponibiliza uma pequena interface HTTP local para consultar a saúde do serviço e as informações de uma entrega.

O arquivo `auditoria.js` recebe todos os eventos publicados no sistema. Ele registra as informações recebidas em um arquivo de log, permitindo acompanhar o histórico das ações e manter um registro do que aconteceu durante o funcionamento da aplicação.

O arquivo `provocar-falhas.js` é utilizado para testar o comportamento da mensageria diante de situações inesperadas. Ele publica eventos duplicados e mensagens em formato inválido, permitindo verificar como o sistema lida com essas ocorrências.

Por fim, o arquivo `ver-filas.js` permite consultar informações sobre as filas do RabbitMQ e suas respectivas filas de mensagens não processadas, facilitando o acompanhamento do funcionamento da mensageria.

## Arquivos de suporte e configuração

Além dos arquivos responsáveis pela lógica da mensageria e pelo processamento dos eventos, o projeto possui arquivos de suporte e configuração. Eles não são responsáveis diretamente pela publicação ou pelo consumo dos eventos, mas auxiliam na instalação das dependências, na execução da aplicação e na organização do ambiente.

### `package.json`

Reúne as configurações principais do projeto, incluindo as dependências necessárias para seu funcionamento e os comandos utilizados para executar os consumidores, preparar o RabbitMQ, consultar as filas e realizar os testes.

### `package-lock.json`

Registra as versões das dependências instaladas no projeto, ajudando a garantir que a instalação dos pacotes seja consistente nos diferentes ambientes utilizados pela equipe.

### `Dockerfile`

Contém as instruções necessárias para construir uma imagem Docker da aplicação, permitindo preparar seu ambiente de execução em um contêiner.

### `.dockerignore`

Define quais arquivos e pastas devem ser ignorados durante a construção da imagem Docker, evitando a inclusão de conteúdos desnecessários.

## Tratamento de mensagens e falhas

A mensageria utiliza mecanismos de controle para acompanhar o processamento das mensagens e identificar situações que exigem atenção.

Entre esses recursos estão a confirmação de recebimento, o tratamento de erros e o controle de duplicidade. O sistema também utiliza identificadores de requisição para facilitar o rastreamento dos eventos e das mensagens durante a execução.

Os detalhes sobre as estratégias de novas tentativas (Retry), o funcionamento das Dead Letter Queues (DLQ), a idempotência e os testes de falhas e duplicidade são apresentados na Parte 4 — Falha e Duplicidade.

## Execução

Para utilizar a mensageria, é necessário que o RabbitMQ esteja em execução e que as dependências do projeto estejam instaladas.

Primeiramente, deve ser realizada a configuração das exchanges e filas. Em seguida, os consumidores podem ser iniciados individualmente, permitindo que cada um receba e processe os eventos destinados a ele.

O projeto também disponibiliza recursos para provocar falhas e consultar o estado das filas, auxiliando na realização de testes e no acompanhamento do funcionamento do sistema.

## Sobre a implementação

A implementação da mensageria permite que o WarHouse realize o processamento de eventos de forma assíncrona e organizada. A separação das responsabilidades entre notificações, logística e auditoria facilita a manutenção do sistema e permite que cada consumidor execute sua função de maneira independente.

Essa estrutura permite organizar a comunicação entre os diferentes serviços, facilitando a manutenção e o acompanhamento das atividades realizadas pela aplicação.


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


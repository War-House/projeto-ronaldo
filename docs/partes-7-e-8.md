# 7. Rota agregada e degradação graciosa 

A degradação graciosa é um conceito de arquitetura de software que permite que uma aplicação continue oferecendo suas funcionalidades principais, mesmo quando algum de seus componentes apresenta falhas ou fica temporariamente indisponível. Em vez de interromper todo o funcionamento do sistema, essa estratégia procura preservar os recursos que ainda podem ser utilizados, reduzindo os impactos causados pela falha.

No projeto WarHouse, esse comportamento é importante porque a aplicação é formada por diferentes serviços que trabalham em conjunto, como o API Gateway, a API REST, o GraphQL e a Mensageria com RabbitMQ. Cada componente possui uma responsabilidade específica e participa de diferentes etapas do funcionamento do sistema. Por isso, a indisponibilidade de um deles pode afetar determinadas operações, enquanto outras continuam disponíveis.

## 7.1. Comportamento dos componentes em caso de falha

**API Gateway:** O Gateway funciona como o único ponto de entrada para as requisições externas, encaminhando as solicitações aos serviços internos. Dessa forma, caso fique indisponível, os usuários não conseguirão acessar as funcionalidades da aplicação por meio de suas rotas públicas, mesmo que os demais serviços continuem funcionando internamente. Isso demonstra que o Gateway representa um ponto único de falha na arquitetura atual.

**API REST:** A API REST é responsável pelas principais operações relacionadas aos jogos e pedidos, como consultar informações, cadastrar registros e atualizar dados. Caso esse serviço fique indisponível, as operações que dependem dele não poderão ser realizadas. Além disso, o GraphQL também será afetado, pois obtém suas informações por meio de chamadas à API REST. A rota agregada do painel também não conseguirá apresentar os dados principais do pedido, já que essa consulta depende diretamente da API REST.

**GraphQL:** O GraphQL disponibiliza consultas que reúnem informações relacionadas ao domínio do WarHouse, facilitando o acesso aos dados necessários para determinadas telas da aplicação. Se esse serviço ficar indisponível, as consultas e operações que dependem de suas rotas deixarão de funcionar. Entretanto, as funcionalidades acessadas diretamente pela API REST e a rota agregada do painel de pedidos poderão continuar operando normalmente, desde que seus serviços necessários estejam disponíveis.

**Mensageria (RabbitMQ):** A Mensageria é responsável pelo processamento assíncrono dos eventos gerados pelas operações do sistema. Caso o RabbitMQ fique indisponível, a API REST ainda poderá registrar um pedido e responder ao cliente sem precisar aguardar a execução dos consumidores. O evento correspondente ficará armazenado temporariamente na Outbox, aguardando o restabelecimento da conexão para que o processo de publicação seja realizado novamente.

Essa separação permite que o cadastro do pedido não dependa da disponibilidade imediata do sistema de mensageria. Entretanto, existem limitações no protótipo: a Outbox é armazenada em memória e, portanto, os eventos pendentes poderão ser perdidos caso o processo da API REST seja encerrado antes da publicação. Em um ambiente de produção, o mais adequado seria utilizar uma tabela persistente em banco de dados para armazenar esses eventos.

## 7.2. Funcionamento da rota agregada

No WarHouse, a rota agregada foi desenvolvida para atender à tela de acompanhamento de pedidos. Seu objetivo é reunir informações que estão distribuídas entre diferentes serviços, permitindo que o cliente obtenha os dados necessários por meio de uma única requisição.

A rota utilizada é `/api/painel/pedidos/:id` e combina três conjuntos de informações: os dados principais do pedido, obtidos pela API REST; os dados dos jogos relacionados; e as informações sobre a situação da entrega, obtidas pelo serviço de Logística. Dessa forma, o Gateway consulta o pedido, obtém os dados dos jogos e busca as informações de entrega, reunindo os resultados em uma única resposta.

Quando todos os serviços necessários estão disponíveis, a rota retorna uma resposta completa, contendo os dados do pedido, seus itens, as informações dos jogos e a situação da entrega. Esse funcionamento facilita o acompanhamento, pois evita que o cliente precise realizar várias requisições separadas para obter essas informações.

Por outro lado, quando ocorre uma falha em um dos serviços complementares, a rota procura preservar os dados que ainda podem ser recuperados. Por exemplo, se o serviço de Logística estiver indisponível, as informações principais do pedido e dos jogos continuam sendo apresentadas. Nesse caso, o campo `entrega` recebe o valor `null`, o campo `parcial` recebe `true` e a lista `indisponiveis` identifica o serviço de Logística como indisponível.

O mesmo princípio é aplicado quando a consulta dos jogos falha: os dados principais do pedido continuam disponíveis, mas as informações dos jogos relacionados não podem ser apresentadas. Já quando a consulta do próprio pedido falha, não é possível montar a resposta principal da rota, pois essa informação é indispensável para a composição dos demais dados.

Portanto, a rota agregada demonstra a aplicação da degradação graciosa no projeto, pois uma falha em um serviço complementar não impede necessariamente o acesso às demais informações. Assim, o sistema consegue oferecer uma resposta parcial em vez de interromper completamente a funcionalidade.

### Evidências da execução

***Evidência 1 — Funcionamento normal da rota agregada***

<img width="589" height="697" alt="image" src="https://github.com/user-attachments/assets/7162c057-4084-4d55-9c13-580676054019" />

Figura 1 — Resposta completa da rota agregada, reunindo informações do pedido, dos jogos e da entrega em uma única requisição.

***Evidência 2 — Funcionamento da rota agregada com indisponibilidade da Logística***

<img width="532" height="498" alt="image" src="https://github.com/user-attachments/assets/c342a6db-cd72-4822-b5f7-04623785f3b4" />

Figura 2 — Resposta parcial da rota agregada durante a indisponibilidade do serviço de Logística, mantendo os dados principais do pedido disponíveis.

## 7.3. Comportamento das mensagens durante falhas no RabbitMQ

O processamento das mensagens também possui mecanismos para lidar com falhas. No WarHouse, a API REST registra os eventos na Outbox, enquanto um processo separado fica responsável por publicá-los no RabbitMQ. Esse processo utiliza confirmações de publicação (*publisher confirms*) para verificar se o broker confirmou o recebimento da mensagem.

Quando o RabbitMQ fica indisponível durante a publicação, o evento permanece marcado como pendente na Outbox, e o processo tenta restabelecer a conexão para realizar uma nova publicação. Dessa maneira, enquanto a API REST continuar em execução, os eventos poderão aguardar até que o serviço de mensageria volte a funcionar.

Durante o consumo, as mensagens também utilizam confirmação manual (*ack*). Isso significa que o consumidor só confirma o recebimento depois de concluir o processamento com sucesso. Por esse motivo, o sistema também utiliza idempotência, identificando eventos já processados por meio de seus identificadores e evitando a repetição de seus efeitos.

No protótipo, quando a conexão com o RabbitMQ é encerrada, o processo do consumidor também é finalizado, sendo necessário reiniciá-lo após o restabelecimento do broker. As mensagens que ainda não receberam confirmação podem retornar à fila para serem processadas novamente.

Além disso, quando ocorre uma falha durante o processamento, o consumidor pode realizar novas tentativas com intervalos crescentes. Se o limite de tentativas for atingido ou ocorrer um erro permanente, a mensagem é encaminhada para a fila de mensagens não processadas, conhecida como *Dead Letter Queue* (DLQ).

É importante destacar que, no protótipo, a Outbox e o controle de eventos processados pelos consumidores utilizam armazenamento em memória. Portanto, embora o projeto apresente mecanismos de confirmação, repetição e tratamento de falhas, uma implementação de produção precisaria utilizar armazenamento persistente para aumentar a segurança dos dados e a confiabilidade do processamento.

---

# 8. Fechamento

A arquitetura do WarHouse foi organizada para dividir as responsabilidades do sistema entre diferentes componentes, permitindo que cada serviço execute uma função específica e se comunique com os demais de acordo com a necessidade. Essa organização busca facilitar a manutenção, o controle das operações e o processamento das informações, além de proporcionar maior visibilidade sobre o funcionamento da aplicação.

## 8.1. Explicação do diagrama da arquitetura

O diagrama apresenta a comunicação entre os principais componentes do WarHouse, desde os sistemas que acessam a aplicação até os serviços responsáveis pelo processamento das operações.

<img width="845" height="563" alt="image" src="https://github.com/user-attachments/assets/500dbd48-4bd4-4374-bc71-b6a53e66616f" />

Figura 3 — Diagrama geral da arquitetura do sistema WarHouse, apresentando seus componentes e os fluxos de comunicação síncrona e assíncrona.

Na parte superior, estão representados três clientes: o aplicativo do cliente, o painel administrativo e a ludoteca parceira. Todos acessam o sistema por meio do API Gateway, que funciona como a única porta pública da aplicação. Ele recebe as requisições, identifica os clientes e aplica mecanismos de segurança e controle, como autenticação por chave de API, autorização por rota e limitação de requisições.

Após receber uma solicitação, o Gateway encaminha a operação ao serviço responsável. A API REST concentra as principais funcionalidades relacionadas ao cadastro e à consulta de jogos e pedidos. Já o GraphQL oferece uma alternativa para consultar e reunir informações necessárias às telas da aplicação, buscando os dados por meio da API REST.

O diagrama também apresenta a comunicação assíncrona por meio do RabbitMQ. Quando uma operação gera um evento, a API REST registra essa informação na Outbox e o processo responsável realiza sua publicação no RabbitMQ. A partir daí, as mensagens são distribuídas para filas específicas, consumidas pelos serviços de Notificações, Auditoria e Logística. Dessa maneira, essas atividades podem ser executadas separadamente da requisição inicial do usuário.

Além disso, o serviço de Logística também disponibiliza uma comunicação HTTP interna com o Gateway, permitindo a consulta das informações de entrega utilizadas na rota agregada do painel de pedidos.

Por fim, o diagrama diferencia os dois principais tipos de comunicação utilizados: as linhas contínuas representam a comunicação síncrona, realizada por HTTP, enquanto as linhas tracejadas representam a comunicação assíncrona, realizada por meio do RabbitMQ.

## 8.2. Decisões arquiteturais e justificativas

### 1. Utilização do API Gateway como única porta pública

Uma das decisões adotadas foi centralizar o acesso externo ao sistema por meio do API Gateway, evitando que os clientes precisem acessar diretamente cada serviço interno.

Essa escolha permite concentrar mecanismos importantes, como autenticação, autorização, limitação de requisições, identificação das solicitações e controle de falhas. Com isso, os serviços internos podem permanecer isolados do acesso externo, enquanto o Gateway organiza o encaminhamento das operações.

Essa decisão contribui para a segurança e para a padronização da comunicação. Entretanto, também exige atenção à disponibilidade do Gateway, pois sua interrupção impede o acesso às funcionalidades por meio das rotas públicas.

### 2. Utilização do RabbitMQ para processamento assíncrono

Outra decisão foi utilizar o RabbitMQ para distribuir os eventos gerados pelas operações do sistema, permitindo que atividades como notificações, auditoria e logística sejam processadas por consumidores independentes.

Essa abordagem evita que a requisição inicial precise aguardar a conclusão de todas essas atividades. Por exemplo, após o cadastro de um pedido, o sistema pode registrar o evento e permitir que os consumidores realizem suas respectivas tarefas separadamente.

Essa separação reduz o acoplamento entre os componentes e facilita a evolução dos serviços. Além disso, o projeto utiliza mecanismos como filas duráveis, confirmações de publicação, tentativas de reprocessamento e filas de mensagens não processadas (DLQ) para lidar com possíveis falhas.

## 8.3. Rastreamento das requisições com X-Request-Id

Para facilitar o acompanhamento das operações realizadas no sistema, o WarHouse utiliza o identificador `X-Request-Id`, que permite relacionar os registros gerados por diferentes componentes durante o processamento de uma mesma requisição.

Na demonstração da Cena 8, é realizado o cadastro de um aluguel por meio do API Gateway. Ao receber a solicitação, o Gateway gera um identificador único e o utiliza durante o encaminhamento da requisição à API REST. A API REST recebe esse identificador, mantém sua utilização nos registros e o associa ao evento gerado pela operação.

Quando o evento é publicado no RabbitMQ, o identificador também é encaminhado junto à mensagem, por meio das informações de correlação. Dessa forma, os consumidores conseguem recuperar o mesmo valor e utilizá-lo em seus próprios registros.

Assim, ao consultar os logs do Gateway, da API REST e dos consumidores, é possível localizar as informações relacionadas à mesma operação utilizando um único identificador. A Cena 8 também verifica esse rastreamento no registro produzido pelo consumidor de Auditoria, demonstrando como uma requisição pode ser acompanhada mesmo depois de passar pelo processamento assíncrono.

Esse mecanismo facilita a identificação de falhas, a investigação de comportamentos inesperados e o acompanhamento do caminho percorrido por uma operação dentro da arquitetura.

### Evidências da execução

***Evidência 3 — Rastreamento da requisição entre os serviços por meio do X-Request-Id***

<img width="1144" height="90" alt="image" src="https://github.com/user-attachments/assets/f0fba069-9c6e-4f22-b1f1-eda753557bab" />

Figura 4 — Demonstração da propagação do mesmo X-Request-Id entre o Gateway, a API REST e os consumidores assíncronos, permitindo acompanhar uma requisição ao longo da arquitetura.

***Evidência 4 — Registro do evento no serviço de auditoria***

<img width="2455" height="248" alt="image" src="https://github.com/user-attachments/assets/c2700ec3-5eb4-489c-8b37-459f4e58122d" />

Figura 5 — Registro do evento de criação do pedido no arquivo de auditoria, contendo o X-Request-Id utilizado para rastrear a requisição.

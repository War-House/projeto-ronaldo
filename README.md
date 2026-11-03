# Arquitetura de Software - Projeto do Grupo

Grupo: ____  |  Tema: ____  |  Integrantes: ____

## Como abrir o ambiente (sem instalar nada)
1. No GitHub, clique em **Code > Codespaces > Create codespace on main**.
2. Aguarde 2 a 5 minutos (Node.js 22 e RabbitMQ sobem sozinhos).
3. No terminal: `npm run rabbit:check` (deve mostrar `RabbitMQ OK`).
4. Painel do RabbitMQ: aba **Ports**, porta 15672, usuário/senha `guest`/`guest` (somente estudo).

## Pastas
| Pasta | Conteúdo | Porta |
| --- | --- | --- |
| `rest/` | Tutorial API REST | 3000 |
| `mensageria/` | Tutorial Mensageria (RabbitMQ) | 5672 / 15672 |
| `graphql/` | Tutorial GraphQL | 4000 |
| `gateway/` | Tutorial API Gateway | 3000 (+ 3001 e 3002 internas) |
| `testes/` | Roteiros de teste e evidências | - |
| `docs/` | Documentação do semestre (oficinas) | - |

REST e Gateway usam a porta 3000: rode um de cada vez.

## Comandos
- `npm run rabbit:up` / `npm run rabbit:down`: liga e desliga o RabbitMQ.
- `npm run rabbit:check`: confere se o RabbitMQ está respondendo.

## Cota gratuita
Pare o Codespace ao terminar (menu: *Codespaces: Stop Current Codespace*) e faça commit/push com frequência.

## Divisão de responsabilidades
| Integrante | Responsável por |
| --- | --- |
| | |

## Uso de IA
Descreva aqui quais ferramentas de IA foram usadas e para quê.

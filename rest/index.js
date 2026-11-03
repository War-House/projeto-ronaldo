// index.js — sobe a API REST do WarHouse e o relay da outbox
import { criarApp } from './app.js';
import { iniciarRelay } from './eventos.js';

const PORTA = Number(process.env.PORT ?? 3001);
// 127.0.0.1 = só aceita conexões desta máquina: quem está fora só enxerga o gateway.
// (No compose completo, HOST=0.0.0.0 dentro da rede interna do Docker, sem porta publicada.)
const HOST = process.env.HOST ?? '127.0.0.1';

const app = criarApp();
iniciarRelay();

app.listen(PORTA, HOST, () => console.log(`API REST do WarHouse em http://${HOST}:${PORTA}`));

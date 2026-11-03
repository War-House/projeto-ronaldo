// gateway.js — sobe o API Gateway do WarHouse: o ÚNICO processo que ouve na porta pública
import { criarGateway } from './app.js';

const PORTA = Number(process.env.PORT ?? 3000);
const { app } = criarGateway();

// Sem host: ouve em todas as interfaces (é a porta pública). Os serviços ouvem só em 127.0.0.1.
app.listen(PORTA, () => console.log(`Gateway do WarHouse em http://localhost:${PORTA}`));

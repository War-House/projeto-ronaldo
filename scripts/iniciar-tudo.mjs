// iniciar-tudo.mjs — sobe os 6 processos do WarHouse em um só terminal, com o log de cada um
// identificado por cor. Comandos digitados neste terminal (para a demonstração ao vivo):
//   parar <nome>     ex.: parar rest        (simula o serviço fora do ar: 502 e depois 503)
//   iniciar <nome>   ex.: iniciar rest      (religa e mostra a recuperação)
//   status           mostra quais processos estão no ar
//   sair             encerra tudo (ou Ctrl+C)
// Nomes: rest, graphql, gateway, notificacoes, logistica, auditoria
//
// Pré-requisito: RabbitMQ no ar (npm run rabbit:up) e dependências instaladas (npm run instalar).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Ordem de subida: primeiro quem é chamado, por último o gateway
const PROCESSOS = {
  rest:         { pasta: 'rest',       arquivo: 'index.js',        cor: 32, porta: '127.0.0.1:3001' },
  graphql:      { pasta: 'graphql',    arquivo: 'index.js',        cor: 35, porta: '127.0.0.1:4000' },
  notificacoes: { pasta: 'mensageria', arquivo: 'notificacoes.js', cor: 33, porta: '-' },
  logistica:    { pasta: 'mensageria', arquivo: 'logistica.js',    cor: 36, porta: '127.0.0.1:3003' },
  auditoria:    { pasta: 'mensageria', arquivo: 'auditoria.js',    cor: 34, porta: '-' },
  gateway:      { pasta: 'gateway',    arquivo: 'gateway.js',      cor: 31, porta: '0.0.0.0:3000 (pública)' },
};
const filhos = new Map();

function iniciar(nome) {
  const p = PROCESSOS[nome];
  if (!p) return console.log(`Processo desconhecido: ${nome}. Use: ${Object.keys(PROCESSOS).join(', ')}`);
  if (filhos.has(nome)) return console.log(`${nome} já está no ar.`);
  const filho = spawn(process.execPath, [p.arquivo], { cwd: path.join(raiz, p.pasta), env: process.env });
  const prefixo = `\x1b[${p.cor}m${nome.padEnd(12)}\x1b[0m|`;
  for (const fluxo of [filho.stdout, filho.stderr]) {
    createInterface({ input: fluxo }).on('line', (linha) => console.log(`${prefixo} ${linha}`));
  }
  filho.on('exit', (codigo) => {
    filhos.delete(nome);
    console.log(`${prefixo} (encerrado${codigo ? `, código ${codigo}` : ''})`);
  });
  filhos.set(nome, filho);
}

function parar(nome) {
  const filho = filhos.get(nome);
  if (!filho) return console.log(`${nome} não está no ar.`);
  filho.kill();
}

function status() {
  console.log('\nProcesso      Porta                     Situação');
  for (const [nome, p] of Object.entries(PROCESSOS)) {
    console.log(`${nome.padEnd(13)} ${p.porta.padEnd(25)} ${filhos.has(nome) ? 'no ar' : 'parado'}`);
  }
  console.log('');
}

function sair() {
  for (const filho of filhos.values()) filho.kill();
  setTimeout(() => process.exit(0), 300);
}

for (const nome of Object.keys(PROCESSOS)) {
  iniciar(nome);
  await new Promise((r) => setTimeout(r, 400));
}
setTimeout(status, 1500);

createInterface({ input: process.stdin }).on('line', (linha) => {
  const [comando, nome] = linha.trim().split(/\s+/);
  if (comando === 'parar') parar(nome);
  else if (comando === 'iniciar') iniciar(nome);
  else if (comando === 'status') status();
  else if (comando === 'sair') sair();
  else if (comando) console.log('Comandos: parar <nome> | iniciar <nome> | status | sair');
});
process.on('SIGINT', sair);

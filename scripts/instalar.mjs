// instalar.mjs — roda "npm install" em cada pasta de código (funciona no Windows, macOS e Linux)
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const pasta of ['rest', 'mensageria', 'graphql', 'gateway']) {
  console.log(`>> npm install em ${pasta}/`);
  execSync('npm install --no-audit --no-fund', { cwd: path.join(raiz, pasta), stdio: 'inherit' });
}
console.log('>> Dependências instaladas. Próximo passo: npm run rabbit:up');

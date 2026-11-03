#!/usr/bin/env bash
# Executado uma vez, quando o Codespace é criado.
# Instala as dependências de cada pasta que já tenha um package.json.
for pasta in rest mensageria graphql gateway; do
  if [ -f "$pasta/package.json" ]; then
    echo ">> npm install em $pasta"
    (cd "$pasta" && npm install)
  fi
done
echo ">> Ambiente pronto. Rode: npm run rabbit:check"

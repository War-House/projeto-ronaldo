# Imagem do serviço gateway do WarHouse (usada pelo perfil "completo" do compose.yaml)
FROM node:22-alpine
WORKDIR /app
# Primeiro só o package*.json: a camada do npm ci fica em cache enquanto as dependências não mudam
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Dentro da rede do Docker o serviço ouve em todas as interfaces; quem decide o que é público é o compose
ENV HOST=0.0.0.0 NODE_ENV=development
EXPOSE 3000
CMD ["node", "gateway.js"]

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

EXPOSE 8080

# Default: run webhook server. Override with args for CLI commands.
CMD ["npx", "tsx", "src/server.ts"]

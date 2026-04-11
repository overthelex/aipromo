FROM node:20-alpine

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

EXPOSE 3000

# Default: run webhook server. Override with args for CLI commands.
CMD ["npx", "tsx", "src/server.ts"]

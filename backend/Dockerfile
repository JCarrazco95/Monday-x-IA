# MAXIRent backend (Node 22 / Express / node:sqlite)
FROM node:22-slim
WORKDIR /app

# Dependencias (incluye dev: TypeScript para el build)
COPY package*.json ./
RUN npm install

# Codigo y build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/app/data/maxirent.db
EXPOSE 4000

# Seed idempotente (crea/activa agentes) y arranca el servidor.
CMD ["sh","-c","node dist/db/seed.js && node dist/index.js"]

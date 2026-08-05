# Build de TODOS los microservicios + cliente en una sola imagen. Los 6
# procesos (5 microservicios + gateway) corren dentro del mismo contenedor
# vía scripts/start-all.js — pensado para plataformas de un solo contenedor
# (Railway/Render). Para un despliegue real de microservicios (un contenedor
# por servicio, escalables por separado) usar docker-compose.yml.
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/gateway/package.json services/gateway/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/transactions-service/package.json services/transactions-service/package.json
COPY services/budget-service/package.json services/budget-service/package.json
COPY services/investments-service/package.json services/investments-service/package.json
COPY services/ai-service/package.json services/ai-service/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
RUN npm run build -w client

FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/services services
COPY --from=build /repo/client/dist client/dist
COPY --from=build /repo/scripts/start-all.js scripts/start-all.js

EXPOSE 8000
CMD ["node", "scripts/start-all.js"]

# Imagen dedicada de transactions-service. Build de contexto = raíz del repo.
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/transactions-service/package.json services/transactions-service/package.json
RUN npm ci

COPY packages packages
COPY services/transactions-service services/transactions-service
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/services/transactions-service services/transactions-service

WORKDIR /repo/services/transactions-service
EXPOSE 4002
CMD ["node", "src/index.js"]

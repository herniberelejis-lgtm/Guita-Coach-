# Imagen dedicada de ai-service. Build de contexto = raíz del repo.
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/ai-service/package.json services/ai-service/package.json
RUN npm ci

COPY packages packages
COPY services/ai-service services/ai-service
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/services/ai-service services/ai-service

WORKDIR /repo/services/ai-service
EXPOSE 4005
CMD ["node", "src/index.js"]

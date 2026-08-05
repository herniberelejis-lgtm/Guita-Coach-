# Imagen dedicada del gateway — también compila y sirve el build de React.
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/gateway/package.json services/gateway/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY packages packages
COPY services/gateway services/gateway
COPY client client
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
RUN npm run build -w client

FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/packages packages
COPY --from=build /repo/services/gateway services/gateway
COPY --from=build /repo/client/dist client/dist

WORKDIR /repo/services/gateway
EXPOSE 8000
CMD ["node", "src/index.js"]

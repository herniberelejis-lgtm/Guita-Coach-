# Job de migración — corre `prisma db push` una vez contra la base compartida
# antes de levantar los microservicios. Ver el servicio "migrate" en
# docker-compose.yml.
FROM node:20-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
RUN npm ci

COPY packages/db packages/db
WORKDIR /repo/packages/db
CMD ["npx", "prisma", "db", "push", "--accept-data-loss"]

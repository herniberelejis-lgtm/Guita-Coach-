# Guita Coach 🌿

Asesor financiero personal para Argentina. Se conecta a Mercado Pago y Gmail,
centraliza tus ingresos y gastos, filtra transferencias entre tus propias
cuentas y duplicados, y te asesora con IA sobre tus hábitos reales de gasto.

## Features

- 💸 **Sincronización automática** con Mercado Pago (OAuth), comprobantes de Gmail,
  CSV de Mercado Pago, y agregadores bancarios (Plaid, Prometeo Open Banking)
- 🧹 **Datos limpios**: detección de transferencias entre cuentas propias y gastos duplicados entre fuentes
- 📊 **Dashboard visual**: presupuesto configurable (necesidades/gustos/ahorro), desglose por categoría e insights mensuales
- 🤖 **Asesor IA** (Gemini/Claude): analiza tus patrones de gasto y responde con tus números reales
- 🎯 **Metas de ahorro** con submetas, gastos fijos y compras en cuotas
- 📈 **Inversiones**: carga manual o importación (Cocos, IOL, Bull Market, PPI), P&L, XIRR, VaR, diversificación
- 🎓 **Academia** con contenido educativo priorizado según tu perfil
- 💵 **Dólar blue/oficial** en tiempo real
- 🔔 Alertas al acercarte a los límites de presupuesto

## Stack

Node.js + React, en **JavaScript puro** (sin TypeScript), con una arquitectura
de **microservicios**:

- **`client/`** — React · Vite · Tailwind CSS · TanStack Query
- **`services/gateway/`** — único punto de entrada público: hace proxy a cada
  microservicio y sirve el build de React
- **`services/auth-service/`** — registro/login, sesiones, OAuth (Google, Gmail, Mercado Pago)
- **`services/transactions-service/`** — CRUD de transacciones + sincronización (Gmail, MP, CSV, Plaid, Prometeo)
- **`services/budget-service/`** — presupuesto/onboarding, insights del mes, metas y gastos fijos
- **`services/investments-service/`** — cartera de inversiones, holdings, analítica de riesgo, precios en vivo
- **`services/ai-service/`** — chat con IA, consejos financieros y Guita Coach Academy
- **`packages/db/`** — esquema Prisma compartido (SQLite en dev, Postgres en producción)
- **`packages/shared/`** — utilidades comunes a todos los servicios (auth de sesión, cripto, cálculos de inversión, etc.)

Todos los microservicios comparten la misma base de datos (vía Prisma) pero
son procesos, `package.json` y despliegues **independientes**. El gateway es
el único puerto expuesto públicamente.

## Correr local

Requiere Node.js 20+.

```bash
git clone https://github.com/TU_USUARIO/guita-coach.git
cd guita-coach
npm install

cp .env.example .env
# completá tus claves ahí (Gemini/Claude, Google OAuth, Mercado Pago).
# Sin claves, la app funciona igual con carga manual y asesor en modo reglas.

npm run db:push      # crea el esquema (packages/db/prisma/dev.db)
npm run db:seed      # opcional: carga datos de demo

npm run dev          # levanta gateway + los 5 microservicios + client (Vite) en paralelo
```

Abrí http://localhost:5173 (el cliente de Vite hace proxy de `/api` al gateway,
puerto 8000). Si preferís levantar solo el backend (sin el cliente en modo dev):

```bash
npm run dev:services   # gateway + auth + transactions + budget + investments + ai
npm run dev:client     # en otra terminal, si lo necesitás
```

## Build de producción

```bash
npm run build   # build del cliente (vite build)
npm start       # levanta gateway + los 5 microservicios en procesos separados
```

## Deploy

Ver [docs/deploy.md](docs/deploy.md). El repo incluye:

- `Dockerfile` + `Procfile` — todos los microservicios en **un solo contenedor**
  (útil para PaaS de un solo servicio como Railway/Render hobby).
- `docker-compose.yml` + un `Dockerfile` por servicio — despliegue de
  microservicios **real**, un contenedor por servicio, escalables por separado.

## Tests

Actualmente no hay suite de tests automatizados; el proyecto se validó con
pruebas end-to-end manuales (registro, onboarding, transacciones, inversiones,
chat IA, sync) tanto en local como en Docker Compose.

# Publicar Guita Coach — guía de deploy

Guita Coach está armado como microservicios independientes (`services/gateway`,
`auth-service`, `transactions-service`, `budget-service`, `investments-service`,
`ai-service`) que comparten una base de datos vía `packages/db` (Prisma).
Hay dos formas de desplegarlo, según la plataforma:

## Opción A — Un solo contenedor (Railway/Render hobby, PaaS simples)

El `Dockerfile` de la raíz compila los 5 microservicios + el gateway + el
cliente React en una sola imagen, y `scripts/start-all.js` los corre como
procesos separados dentro del mismo contenedor (siguen siendo servicios
independientes a nivel de código; solo comparten el contenedor por
simplicidad de deploy).

1. Subí el repo a GitHub (privado está bien).
2. En [railway.app](https://railway.app): New Project → Deploy from GitHub
   (detecta el `Dockerfile` automáticamente).
3. Agregá un servicio Postgres (Railway lo da con un click) y copiá su `DATABASE_URL`.
   - Si preferís seguir con SQLite, montá un volumen persistente en
     `/repo/packages/db/prisma` (en Railway: Settings → Volumes).
4. Variables de entorno (Settings → Variables) — ver `.env.example` para la lista completa:
   - `DATABASE_URL` — la del Postgres que creaste (o `file:./dev.db` con volumen)
   - `SECRET_KEY` — generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `GEMINI_API_KEY` — aistudio.google.com/apikey
   - `APP_URL` — la URL pública que te da Railway (ej. `https://guita.up.railway.app`)
   - `DEMO_MODE=false`
   - `GOOGLE_CLIENT_ID/SECRET`, `MP_CLIENT_ID/SECRET` cuando los tengas
   - Los `*_SERVICE_URL` **no** hace falta tocarlos: al correr todo en el mismo
     contenedor, los defaults (`http://localhost:400X`) ya funcionan.
5. El `Procfile` corre `prisma db push` antes de levantar los servicios, así
   que el esquema se sincroniza solo en cada deploy.
6. Actualizá los redirect URIs de Google y MP. Hay que registrar **cuatro**:
   - Google: `{APP_URL}/api/auth/gmail/callback` (sync de comprobantes)
     y `{APP_URL}/api/auth/google/login/callback` (botón "Continuar con Google")
   - Mercado Pago: `{APP_URL}/api/auth/mp/callback` (sync wallet)
     y `{APP_URL}/api/auth/mp/login/callback` (botón "Continuar con Mercado Pago")

## Opción B — Microservicios reales (un contenedor por servicio)

Para correr cada servicio de forma independiente y escalable (Kubernetes,
ECS, Nomad, o un VPS con `docker compose`), cada uno tiene su propio
`Dockerfile` (`services/<nombre>/Dockerfile`, contexto = raíz del repo).

Localmente, con `docker compose`:

```bash
cp .env.example .env   # completar SECRET_KEY, API keys, etc.
docker compose up --build
```

Esto levanta: `migrate` (corre `prisma db push` una vez), los 5 microservicios,
y el `gateway` (único puerto expuesto: 8000). Comparten la base SQLite vía un
volumen (`dbdata`).

Para un despliegue distribuido real (cada servicio en su propia instancia/nodo):

- Cambiá el `provider` en `packages/db/prisma/schema.prisma` a `postgresql` y
  usá el mismo `DATABASE_URL` (un Postgres gestionado) en todos los servicios.
- Configurá `AUTH_SERVICE_URL`, `TRANSACTIONS_SERVICE_URL`, `BUDGET_SERVICE_URL`,
  `INVESTMENTS_SERVICE_URL` y `AI_SERVICE_URL` en el `gateway` para que apunten
  a las URLs internas/reales de cada servicio desplegado.
- Cada servicio solo necesita `DATABASE_URL`, `SECRET_KEY`, y las variables de
  las integraciones que usa (ver `.env.example`).

## Checklist pre-lanzamiento (bloqueantes)

- [x] **Postgres en producción** — el esquema Prisma soporta Postgres vía `DATABASE_URL`
      (cambiando el `provider` en `packages/db/prisma/schema.prisma`);
      SQLite solo se usa en desarrollo local / demo.
- [x] **Tokens OAuth cifrados en DB** — `packages/shared/crypto.js` usa AES-256-GCM
      derivado de `SECRET_KEY` antes de guardar `Connection.accessToken/refreshToken`.
- [ ] **Rate limiting** en `/api/auth/login` y `/api/auth/register`
      (ej. `express-rate-limit`, 5 intentos/minuto) para frenar fuerza bruta.
- [ ] **HTTPS**: Railway lo da gratis; verificar que la cookie de sesión salga con
      `Secure` (automático si `APP_URL` empieza con https, ver `packages/shared/security.js`).
- [ ] Verificación de la app en Google OAuth (semanas de proceso, empezar ya).

## Deseables para la prueba de mercado

- [ ] Analytics mínimo (Plausible/Umami) para medir activación y retención.
- [ ] Página de aterrizaje con propuesta de valor + botón de registro.
- [ ] Términos y política de privacidad (manejás datos financieros: no es opcional).
- [ ] Botón de feedback / link a WhatsApp para hablar con los primeros usuarios.

# Publicar Guita Coach — guía de deploy

## Vercel (plan gratuito)

El repo ya está preparado: `api/index.py` como entrypoint, `vercel.json` con el
routing y `api/requirements.txt` con las dependencias recortadas para entrar en
el límite de bundle.

### 1. Base de datos (obligatorio, hacelo primero)

En Vercel el disco es de sólo lectura y se borra entre invocaciones, así que
SQLite no funciona. Si falta `DATABASE_URL`, la app aborta al arrancar con un
mensaje explícito en vez de fallar de forma rara más adelante.

1. Creá un Postgres gratis en [neon.tech](https://neon.tech) (o Supabase).
2. Copiá la connection string **pooled** (en Neon dice `-pooler` en el host).
   Es la que corresponde: con muchas instancias serverless, la directa agota
   las conexiones.

### 2. Deploy

1. En [vercel.com](https://vercel.com): Add New → Project → importá el repo.
2. Framework Preset: **Other**. No toques build ni output: manda `vercel.json`.
3. Variables de entorno (Settings → Environment Variables):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la connection string pooled de Neon |
   | `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
   | `APP_URL` | tu dominio de Vercel, sin barra final |
   | `GEMINI_API_KEY` | aistudio.google.com/apikey |
   | `DEMO_MODE` | `false` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | consola de Google |
   | `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | panel de Mercado Pago |

   `APP_URL` es la más fácil de arruinar: con ella se arman los cuatro redirect
   URIs de OAuth. Si no coincide exacto con lo registrado en Google y MP,
   conectar falla con `redirect_uri_mismatch`.

4. Deploy. En el primer arranque se crean las tablas solas.

### 3. Redirect URIs

Los mismos cuatro de la sección de Railway, cambiando el dominio por el de
Vercel. Si venías de Railway, **agregalos** en vez de reemplazarlos: así podés
volver atrás sin tocar nada.

### Qué cambia respecto de Railway

- **El motor de alertas corre en línea**, no en segundo plano. En serverless el
  trabajo posterior a la respuesta se descarta. Una sync queda unos cientos de
  ms más lenta y no se pierde ninguna alerta.
- **Cold starts.** La primera request tras un rato de inactividad tarda unos
  segundos. Es el precio del plan gratis.
- **Timeout de 10s por request** en el plan hobby. Una sync de Gmail con muchos
  meses de historial puede pasarse; si aparece, sincronizá en rangos más cortos.
- **`api/requirements.txt` reemplaza al de la raíz sólo en Vercel.** Si agregás
  una dependencia, tenés que sumarla a los dos archivos.

## Alternativa si Vercel incomoda: Fly.io

Ya hay un `Dockerfile` funcionando, así que `fly launch` lo levanta casi sin
tocar nada. Al ser un contenedor con proceso persistente no hay cold starts, ni
timeout de 10s, ni límite de bundle, y las tareas en segundo plano funcionan.
Es la ruta con menos fricción si el plan gratuito de Vercel queda corto.

## Railway (o Render, equivalente)

1. Subí el repo a GitHub (privado está bien).
2. En [railway.app](https://railway.app): New Project → Deploy from GitHub.
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Variables de entorno (Settings → Variables):
   - `SECRET_KEY` — generar: `python -c "import secrets; print(secrets.token_hex(32))"`
   - `GEMINI_API_KEY` — aistudio.google.com/apikey
   - `APP_URL` — la URL pública que te da Railway (ej. `https://guita.up.railway.app`)
   - `DEMO_MODE=false`
   - `GOOGLE_CLIENT_ID/SECRET`, `MP_CLIENT_ID/SECRET` cuando los tengas
5. Actualizá los redirect URIs de Google y MP. Hay que registrar **cuatro**:
   - Google: `{APP_URL}/api/auth/gmail/callback` (sync de comprobantes)
     y `{APP_URL}/api/auth/google/login/callback` (botón "Continuar con Google")
   - Mercado Pago: `{APP_URL}/api/auth/mp/callback` (sync wallet)
     y `{APP_URL}/api/auth/mp/login/callback` (botón "Continuar con Mercado Pago")

## Checklist pre-lanzamiento (bloqueantes)

- [ ] **Migrar SQLite → Postgres.** SQLite en Railway se borra en cada deploy.
      Railway da Postgres con un click; cambiar `DATABASE_URL` en
      `app/database.py` para leerla de env.
- [ ] **Cifrar tokens OAuth en DB** (hoy van en texto plano — `Connection.access_token`).
      Mínimo: `cryptography.fernet` con clave derivada de `SECRET_KEY`.
- [ ] **Rate limiting** en `/api/auth/login` y `/api/auth/register`
      (slowapi, 5 intentos/minuto) para frenar fuerza bruta.
- [ ] **HTTPS**: Railway lo da gratis; verificar que la cookie salga con
      `Secure` (ya es automático si `APP_URL` empieza con https).
- [ ] Verificación de la app en Google OAuth (semanas de proceso, empezar ya).

## Deseables para la prueba de mercado

- [ ] Analytics mínimo (Plausible/Umami) para medir activación y retención.
- [ ] Página de aterrizaje con propuesta de valor + botón de registro.
- [ ] Términos y política de privacidad (manejás datos financieros: no es opcional).
- [ ] Botón de feedback / link a WhatsApp para hablar con los primeros usuarios.

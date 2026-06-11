# Publicar Guita Coach — guía de deploy

## Opción recomendada: Railway (o Render, equivalente)

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

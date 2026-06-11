# Guita Coach — Estado del proyecto (2026-06-11)

## Novedades de esta iteración (2026-06-11)

- **Login real multi-usuario**: registro/login con email+contraseña (PBKDF2),
  sesiones con cookie HttpOnly (`app/security.py`, tabla `user_sessions`).
  Todos los endpoints migrados de `user_id=1` al usuario autenticado.
  En `DEMO_MODE=true` sigue entrando directo como usuario 1.
- **Filtros de datos** (`app/services/dedup.py`): duplicados entre fuentes
  (manual/Gmail/MP) y transferencias entre cuentas propias se marcan y se
  excluyen de presupuesto, insights, advisor y chat.
- **UI**: pantalla de login/registro, campana de notificaciones con panel,
  donut de distribución de gasto + barras de histórico en el dashboard,
  badges de "transferencia propia" y "duplicado".
- **Tests**: 34/34 pasan (se arreglaron los 2 de MP que pegaban a la API real).
- **Docs nuevas**: `docs/integraciones-bancarias.md` (plan de conexiones
  bancarias en AR) y `docs/deploy.md` (checklist para publicar).


## Para arrancar HOY

```bash
cd C:\Users\Usuario\guita-coach
python run.py
```

Abrí: http://localhost:8000

---

## Qué está listo (100%)

### Backend — Python + FastAPI + SQLite

| Archivo | Qué hace |
|---------|----------|
| `run.py` | Punto de entrada. Crea .env, instala deps, seedea demo, arranca server |
| `app/main.py` | FastAPI app, monta todos los routers, sirve el frontend |
| `app/config.py` | Lee .env con pydantic-settings |
| `app/models.py` | Tablas: User, Connection, Transaction, Alert, CategoryRule |
| `app/database.py` | SQLite engine + init_db() + get_db() dependency |

**Servicios:**
| Archivo | Qué hace |
|---------|----------|
| `app/services/seed.py` | 13 transacciones demo de Hernán (Mayo actual) |
| `app/services/classifier.py` | Clasifica por reglas → Claude API fallback |
| `app/services/alert_engine.py` | Alertas 75%/90%, proyecciones, consejo IA |
| `app/services/gmail.py` | OAuth Gmail, fetch emails de pago, parser |
| `app/services/mercadopago.py` | OAuth MP, fetch movimientos del mes |

**Routers (API):**
| Endpoint | Router |
|----------|--------|
| `GET /api/budget/current` | franjas del mes, alertas |
| `POST /api/budget/onboarding` | configuración inicial |
| `PATCH /api/budget/settings` | actualizar presupuesto |
| `GET /api/transactions` | listar con filtros |
| `PATCH /api/transactions/{id}/category` | corregir categoría + guardar regla |
| `POST /api/transactions` | agregar manual |
| `GET /api/insights/month` | proyecciones por franja |
| `GET /api/insights/summary` | histórico 3 meses |
| `POST /api/sync/gmail` | sincronizar Gmail |
| `POST /api/sync/mp` | sincronizar Mercado Pago |
| `GET /api/auth/gmail` | redirige a Google OAuth |
| `GET /api/auth/gmail/callback` | intercambia code → token |
| `GET /api/auth/mp` | redirige a MP OAuth |
| `GET /api/auth/mp/callback` | intercambia code → token |
| `POST /api/auth/disconnect/{provider}` | desconectar |
| `GET /api/docs` | Swagger UI |

### Frontend — Vanilla HTML + CSS + JS

| Archivo | Qué hace |
|---------|----------|
| `static/index.html` | SPA shell con sidebar y onboarding |
| `static/css/style.css` | Navy #09172A + Gold #C8A84B + DM Sans |
| `static/js/api.js` | Wrapper fetch para todos los endpoints |
| `static/js/app.js` | Router SPA, onboarding, toast, helpers |
| `static/js/dashboard.js` | Franjas (Necesidades/Gustos/Ahorro), alertas, sync |
| `static/js/transactions.js` | Tabla, filtros, modal editar categoría, agregar manual |
| `static/js/insights.js` | Proyecciones y top gastos por franja |
| `static/js/settings.js` | Conexiones OAuth + editar presupuesto |

---

## Credenciales pendientes (cuando las tengas)

Editá `.env`:

```env
# Claude AI — clasificación inteligente
CLAUDE_API_KEY=sk-ant-...

# Gmail OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Mercado Pago OAuth
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...

# En producción cambiar esto
APP_URL=http://localhost:8000
DEMO_MODE=true
```

### Cómo conseguirlas

**Claude API:** https://console.anthropic.com → API Keys → Create Key

**Gmail:**
1. https://console.cloud.google.com → nuevo proyecto
2. APIs & Services → Enable → Gmail API
3. OAuth consent screen → External → rellenar
4. Credentials → Create → OAuth client ID → Web application
5. Authorized redirect: `http://localhost:8000/api/auth/gmail/callback`

**Mercado Pago:**
1. https://developers.mercadopago.com → Tus aplicaciones → Crear app
2. Copiar Client ID y Client Secret
3. En la app MP, agregar redirect: `http://localhost:8000/api/auth/mp/callback`

---

## Stack técnico

```
Python 3.x
FastAPI 0.115.5
SQLAlchemy 2.0 + SQLite (guita.db)
Anthropic SDK 0.40 (claude-sonnet-4-20250514)
httpx (OAuth flows)
Vanilla HTML/CSS/JS (sin frameworks)
```

---

## Flujo de la app

1. `python run.py` → crea DB + seedea 13 txs demo → arranca en :8000
2. Onboarding: nombre + sueldo + % franjas → guarda en User
3. Dashboard: 3 franjas con barra de progreso + alertas + últimas txs
4. Transacciones: filtrar por categoría/búsqueda, editar categoría (guarda regla)
5. Proyecciones: ritmo diario → va a pasar el límite o no
6. Configuración: conectar Gmail/MP → sincronizar → clasifica automáticamente

---

## Pendiente / mejoras futuras

- [ ] Webhook de Mercado Pago (notificaciones en tiempo real)
- [ ] Chat con el coach (Claude conversacional)
- [ ] Export a CSV
- [ ] Deploy en Railway/Render
- [ ] Cifrar tokens de acceso en la DB
- [ ] Multi-usuario (si escala)

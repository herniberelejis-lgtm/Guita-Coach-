# Guita Coach — Documentación Completa del Proyecto

> Coach financiero personal para Argentina. Automatiza el seguimiento de gastos, categoriza transacciones con IA y da consejos concretos para que el dinero alcance.

---

## Tabla de contenidos

1. [Visión del producto](#1-visión-del-producto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Arquitectura general](#3-arquitectura-general)
4. [Variables de entorno](#4-variables-de-entorno)
5. [Base de datos — modelos](#5-base-de-datos--modelos)
6. [API — endpoints completos](#6-api--endpoints-completos)
7. [Servicios del backend](#7-servicios-del-backend)
8. [Frontend SPA](#8-frontend-spa)
9. [Integraciones externas](#9-integraciones-externas)
10. [Motor de IA](#10-motor-de-ia)
11. [Seguridad](#11-seguridad)
12. [Service Worker y PWA](#12-service-worker-y-pwa)
13. [Despliegue](#13-despliegue)
14. [Flujos de usuario clave](#14-flujos-de-usuario-clave)
15. [Diferenciación competitiva](#15-diferenciación-competitiva)

---

## 1. Visión del producto

Guita Coach es un gestor financiero personal diseñado específicamente para el contexto argentino:

- **Tres franjas de presupuesto** basadas en la regla 50/30/20 adaptable: Necesidades, Gustos y Ahorro
- **Importación automática** de transacciones desde Gmail (parsing de emails de pago), Mercado Pago, bancos (vía Prometeo) y CSV
- **Clasificación con IA** de cada gasto en la franja correcta usando reglas + Gemini/Claude
- **Cartera de inversiones** con precios en tiempo real (Yahoo Finance para acciones AR, CoinGecko para crypto), soporte CEDEARs, P&L realizado/no realizado vs MERVAL
- **Chat financiero** con un asesor IA que conoce los números reales del usuario
- **Academia financiera** con contenido educativo priorizado por perfil (principiante, solo crypto, etc.)
- **Detección inteligente** de duplicados entre fuentes, gastos compartidos y reintegros

---

## 2. Stack tecnológico

### Backend
| Componente | Tecnología |
|---|---|
| Framework web | FastAPI 0.115.5 |
| ORM | SQLAlchemy 2.0.36 |
| Servidor ASGI | Uvicorn 0.32.1 |
| Validación | Pydantic 2.11.5 + pydantic-settings |
| HTTP cliente | httpx 0.28.0 |
| Base de datos prod | PostgreSQL (Railway) |
| Base de datos dev | SQLite (archivo local `guita.db`) |
| Excel | openpyxl 3.1.5 |

### IA
| Proveedor | Uso |
|---|---|
| Google Gemini 2.5 Flash | Clasificación de gastos + chat (por defecto) |
| Anthropic Claude Sonnet | Clasificación + chat + alertas (alternativa) |

### Precios de mercado
| Fuente | Cobertura |
|---|---|
| Yahoo Finance | Acciones AR, CEDEARs, acciones US |
| CoinGecko | Crypto (BTC, ETH, etc.) |
| dolarapi.com | Cotización dólar blue y oficial |

### Frontend
| Componente | Tecnología |
|---|---|
| Framework | Vanilla JS SPA (sin build step) |
| Routing | Hash-based (`/#dashboard`, `/#transactions`, etc.) |
| PWA | Service Worker con cache-first (static) + network-first (API) |
| CSS | Custom design system según Manual de Marca Guita Coach v3.0 — tipografía Montserrat, negro absoluto + magenta eléctrico como único acento |
| Gráficos | SVG/DOM a mano (sin librería) — donut de franjas, barras verticales apiladas por mes, barras de progreso |

### Infraestructura
| Componente | Proveedor |
|---|---|
| Hosting prod | Railway |
| Base de datos prod | Railway PostgreSQL |
| Hosting alternativo | Vercel (serverless, `api/index.py`) |

---

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                    Railway (prod)                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  FastAPI (app/main.py)                           │   │
│  │                                                  │   │
│  │  Routers: auth, budget, transactions, insights,  │   │
│  │           sync, advisor, chat, goals,            │   │
│  │           investments, investments_extra,        │   │
│  │           academy                                │   │
│  │                                                  │   │
│  │  Monta /static → Vanilla JS SPA                  │   │
│  │  Rutas SPA via catch-all spa_fallback            │   │
│  └─────────────────┬────────────────────────────────┘   │
│                    │ SQLAlchemy ORM                       │
│  ┌─────────────────▼────────────────────────────────┐   │
│  │  PostgreSQL (Railway)                            │   │
│  │  Tablas: users, connections, transactions,       │   │
│  │          goals, recurring_expenses, user_sessions│   │
│  │          alerts, category_rules, investment,     │   │
│  │          investment_transaction, investment_price│   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

Servicios externos:
├── Gmail API (OAuth 2.0) → parsing de emails de pago
├── Mercado Pago API (OAuth 2.0) → movimientos de cuenta
├── Prometeo API (credenciales del banco) → movimientos bancarios
├── Plaid API (Link token) → bancos internacionales
├── Yahoo Finance (yfinance) → precios acciones
├── CoinGecko API → precios crypto
├── dolarapi.com → cotizaciones USD
└── Gemini / Claude API → clasificación IA + chat
```

### Estructura de directorios

```
Guita-Coach-/
├── app/
│   ├── main.py              # Entry point FastAPI, monta routers y static
│   ├── config.py            # Settings (pydantic-settings, .env)
│   ├── database.py          # Engine SQLAlchemy, migraciones aditivas, init_db
│   ├── models.py            # Todos los modelos SQLAlchemy
│   ├── security.py          # Hash contraseñas (PBKDF2), sesiones por cookie
│   ├── routers/
│   │   ├── auth.py          # Registro, login, OAuth (Google, MP, Gmail)
│   │   ├── budget.py        # Presupuesto, onboarding, alertas
│   │   ├── transactions.py  # CRUD transacciones, corrección categoría
│   │   ├── sync.py          # Sync Gmail, MP, CSV, Plaid, Prometeo
│   │   ├── insights.py      # Análisis, dólar, desglose, dashboard
│   │   ├── advisor.py       # Patrones de gasto + consejos IA
│   │   ├── chat.py          # Chat con asesor financiero IA
│   │   ├── goals.py         # Metas de ahorro, gastos fijos/cuotas
│   │   ├── investments.py   # Cartera de inversiones
│   │   ├── investments_extra.py  # Endpoints adicionales de inversiones
│   │   └── academy.py       # Academia financiera
│   └── services/
│       ├── ai_provider.py   # Abstracción Gemini/Claude (classify, chat, advice)
│       ├── classifier.py    # Pipeline: reglas → IA → revisión manual
│       ├── alert_engine.py  # Motor de alertas de presupuesto
│       ├── gmail.py         # OAuth Gmail + parsing de emails
│       ├── mercadopago.py   # OAuth MP + fetch de movimientos
│       ├── prometeo_api.py  # Cliente Prometeo (bancos AR)
│       ├── plaid_sync.py    # Cliente Plaid
│       ├── plaid_mock.py    # Mock Plaid para desarrollo
│       ├── dedup.py         # Detección duplicados entre fuentes
│       ├── splits.py        # Detección gastos compartidos
│       ├── recurring.py     # Gastos fijos automáticos mensuales
│       ├── payment_method.py # Normalización medios de pago
│       ├── seed.py          # Datos demo (DEMO_MODE=True)
│       ├── investment_calculator.py  # Cálculos P&L, costo promedio
│       ├── investment_parser.py      # Parser CSV/XLSX de brokers
│       ├── investment_analytics.py  # Analítica de cartera
│       ├── prices.py        # Yahoo Finance + CoinGecko + blue
│       ├── csv_import.py    # Importación estado de cuenta MP (CSV)
│       ├── academy_content.py  # Contenido educativo estático
│       └── academy_content.py  # Glosario y topics educativos
├── static/
│   ├── index.html           # Shell de la SPA
│   ├── sw.js                # Service Worker (cache-first static + network-first API)
│   ├── privacidad.html      # Política de privacidad
│   ├── css/
│   │   └── style.css        # Design system completo
│   └── js/
│       ├── app.js           # Router SPA, estado global, bottom sheet
│       ├── api.js           # Cliente HTTP para todos los endpoints
│       ├── auth.js          # Flujos de autenticación
│       ├── dashboard.js     # Vista inicio
│       ├── transactions.js  # Vista transacciones
│       ├── insights.js      # Vista análisis
│       ├── chat.js          # Vista chat IA
│       ├── goals.js         # Vista metas
│       ├── investments.js   # Vista inversiones
│       ├── settings.js      # Vista configuración e integraciones
│       └── academy.js       # Vista academia
├── api/
│   └── index.py             # Entry point Vercel (from app.main import app)
├── vercel.json              # Config Vercel serverless
├── .vercelignore            # Archivos excluidos de Vercel
├── requirements.txt         # Dependencias Python
└── PROYECTO.md              # Este archivo
```

---

## 4. Variables de entorno

Todas en `.env` en la raíz del proyecto (Railway las inyecta como env vars directamente).

| Variable | Descripción | Requerida |
|---|---|---|
| `SECRET_KEY` | Clave para tokens. Cambiar en prod. | Sí |
| `DATABASE_URL` | URL PostgreSQL. Vacío = SQLite local. | Prod |
| `AI_PROVIDER` | `gemini` (default) o `claude` | No |
| `GEMINI_API_KEY` | Google AI Studio API key | Recomendada |
| `CLAUDE_API_KEY` | Anthropic API key | Alternativa |
| `GOOGLE_CLIENT_ID` | OAuth Google (login + Gmail) | Gmail |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | Gmail |
| `MP_CLIENT_ID` | Mercado Pago OAuth | MP |
| `MP_CLIENT_SECRET` | Mercado Pago OAuth | MP |
| `PLAID_CLIENT_ID` | Plaid Open Banking | Plaid |
| `PLAID_SECRET` | Plaid | Plaid |
| `PLAID_ENV` | `sandbox` o `production` | No |
| `PLAID_COUNTRY_CODES` | Default: `AR` | No |
| `PROMETEO_API_KEY` | Prometeo Open Banking AR | Prometeo |
| `PROMETEO_ENV` | `sandbox` o `production` | No |
| `APP_URL` | URL base pública (ej: `https://guita-coach-production.up.railway.app`) | Sí |
| `PORT` | Puerto del servidor. Default: `8000` | No |
| `DEMO_MODE` | `True` = auto-login usuario 1, datos demo | Dev |
| `LIVE_PRICES` | `True` = precios en tiempo real Yahoo/CoinGecko | No |

---

## 5. Base de datos — modelos

### `users`
```
id              INTEGER PK
email           VARCHAR UNIQUE
password_hash   VARCHAR
name            VARCHAR
monthly_income  FLOAT
necesidades_pct FLOAT (default 50.0)
gustos_pct      FLOAT (default 30.0)
ahorro_pct      FLOAT (default 20.0)
payday          INTEGER (día del mes en que cobra)
income_is_variable  BOOLEAN (presupuesto usa ingresos reales, no sueldo fijo)
balance         FLOAT (default 0.0) -- balance de caja editable a mano desde el dashboard
onboarding_done BOOLEAN
created_at      DATETIME
```

### `connections`
Almacena tokens OAuth y estado de conexión para cada integración.
```
id             INTEGER PK
user_id        INTEGER
provider       VARCHAR  -- gmail | mercadopago | plaid | prometeo
status         VARCHAR  -- connected | disconnected | error
access_token   TEXT     -- token OAuth o session_key de Prometeo
refresh_token  TEXT
token_expiry   DATETIME
last_sync      DATETIME
sync_status    VARCHAR  -- idle | syncing | error
```

### `transactions`
Columna central del sistema. Toda transacción (gasto o ingreso) pasa por aquí.
```
id                   INTEGER PK
user_id              INTEGER
source               VARCHAR  -- gmail | mercadopago | plaid | prometeo | manual | csv | demo
provider             VARCHAR  -- nombre del emisor (ej: "Gmail", "Mercado Pago")
merchant             VARCHAR  -- nombre del comercio
amount               FLOAT
currency             VARCHAR  (default "ARS")
date                 VARCHAR  -- YYYY-MM-DD
month                VARCHAR  -- YYYY-MM (para queries eficientes)
category             VARCHAR  -- necesidades | gustos | ahorro | ingreso
subcategory          VARCHAR  -- Delivery | Streaming | Transporte | etc.
status               VARCHAR  -- new | classified | confirmed | reviewed
payment_method       VARCHAR  -- credito | debito | qr | transferencia | efectivo | otro
confidence           FLOAT    -- confianza del clasificador (0-1)
rule_used            VARCHAR  -- qué regla/modelo clasificó
ai_reason            TEXT     -- explicación de la IA
raw_reference        TEXT     -- ID externo (dedup)
needs_review         BOOLEAN
tx_type              VARCHAR  -- expense | income
is_internal_transfer BOOLEAN  -- transferencia entre cuentas propias
is_duplicate         BOOLEAN  -- duplicado detectado entre fuentes
is_reimbursement     BOOLEAN  -- reintegro de gasto compartido
reimburses_tx_id     INTEGER  -- ID de la tx que se está reintegrando
created_at           DATETIME
```

### `goals`
```
id             INTEGER PK
user_id        INTEGER
parent_id      INTEGER NULLABLE  -- para submetas (máximo 1 nivel)
name           VARCHAR
target_amount  FLOAT
saved_amount   FLOAT
currency       VARCHAR  -- ARS | USD
deadline       VARCHAR  -- YYYY-MM-DD
is_done        BOOLEAN
created_at     DATETIME
```

### `recurring_expenses`
Gastos fijos mensuales y compras en cuotas.
```
id                  INTEGER PK
user_id             INTEGER
merchant            VARCHAR
amount              FLOAT
category            VARCHAR
day_of_month        INTEGER  (1-28)
installments_total  INTEGER  (0 = gasto fijo sin fin)
installments_paid   INTEGER
active              BOOLEAN
last_applied_month  VARCHAR  -- YYYY-MM (para idempotencia)
created_at          DATETIME
```

### `user_sessions`
```
id          INTEGER PK
user_id     INTEGER
token       VARCHAR UNIQUE
created_at  DATETIME
expires_at  DATETIME
```

### `alerts`
```
id          INTEGER PK
user_id     INTEGER
type        VARCHAR  -- threshold | projection
category    VARCHAR  -- necesidades | gustos | ahorro
message     TEXT
ai_advice   TEXT
payload     TEXT     -- JSON con datos de acción (ej: split sugerido)
severity    VARCHAR  -- warning | critical
is_read     BOOLEAN
created_at  DATETIME
```

### `category_rules`
Reglas de clasificación personalizadas del usuario (más prioridad que las globales).
```
id              INTEGER PK
user_id         INTEGER
pattern         VARCHAR  -- match case-insensitive en merchant
category        VARCHAR
subcategory     VARCHAR
priority        INTEGER
from_correction BOOLEAN  -- fue aprendida de una corrección manual
```

### `investment` (posiciones)
```
id            INTEGER PK
user_id       INTEGER FK users
broker        VARCHAR  -- cocos_capital | invertir_online | bull_market | manual | crypto_*
ticker        VARCHAR  -- ej: GGAL, BTC, MELI
asset_type    VARCHAR  -- stock | crypto
currency      VARCHAR  -- ARS | USD
quantity      FLOAT
avg_cost      FLOAT    -- costo promedio ponderado
purchase_date DATE
status        VARCHAR  -- open | closed
created_at    DATETIME
updated_at    DATETIME
-- UNIQUE(user_id, ticker, broker)
```

### `investment_transaction` (compras/ventas)
```
id                   INTEGER PK
investment_id        INTEGER FK investment
user_id              INTEGER FK users
broker               VARCHAR
ticker               VARCHAR
asset_type           VARCHAR
currency             VARCHAR
tx_type              VARCHAR  -- buy | sell
quantity             FLOAT
price                FLOAT
date                 DATE
csv_reference        VARCHAR  -- referencia del CSV de origen
linked_transaction_id INTEGER FK transactions  -- si generó un egreso en transactions
created_at           DATETIME
```

### `investment_price` (precios actuales)
```
id           INTEGER PK
ticker       VARCHAR UNIQUE
asset_type   VARCHAR
price        FLOAT
currency     VARCHAR
last_updated DATETIME
```

### Migraciones aditivas
Las migraciones se aplican en `database.py` de forma idempotente (ignora "duplicate column"/"already exists"). Sin sistema de versiones formal — cada nueva columna se lista en el array `migrations`.

---

## 6. API — endpoints completos

Base URL: `/api`  
Autenticación: cookie `gc_session` (HttpOnly, SameSite=Lax)  
Docs interactivos: `/api/docs`

### Auth — `/api/auth`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/register` | Registro con nombre, email, password |
| POST | `/login` | Login con email/password, crea sesión |
| POST | `/logout` | Destruye sesión |
| GET | `/me` | Usuario actual autenticado |
| GET | `/providers` | Métodos de login social disponibles (Google, MP) |
| GET | `/google/login` | Inicia OAuth Google (login) |
| GET | `/google/login/callback` | Callback OAuth Google (login) |
| GET | `/mp/login` | Inicia OAuth Mercado Pago (login) |
| GET | `/mp/login/callback` | Callback OAuth Mercado Pago (login) |
| GET | `/gmail` | Conecta Gmail (requiere sesión) |
| GET | `/gmail/callback` | Callback OAuth Gmail |
| GET | `/mp` | Conecta Mercado Pago wallet (requiere sesión) |
| GET | `/mp/callback` | Callback OAuth MP |
| POST | `/disconnect/{provider}` | Desconecta un proveedor |

### Budget — `/api/budget`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/current` | Presupuesto del mes actual con franjas, alertas y balance |
| POST | `/onboarding` | Completa onboarding (nombre, ingreso, % franjas, día de cobro) |
| PATCH | `/settings` | Actualiza configuración de presupuesto |
| POST | `/alerts/{alert_id}/read` | Marca alerta como leída |
| GET | `/history` | Historial de presupuesto (últimos 6 meses) |

**Respuesta `/current` incluye:**
- Franjas: limit, spent, remaining, usage_pct, daily_allowance
- income, total_expenses, balance
- days_passed, days_remaining, days_in_month
- alerts (unread)
- onboarding_done, name, payday

### Transactions — `/api/transactions`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `` | Lista transacciones (filtros: month, category, payment_method, search; paginación: limit, offset) |
| POST | `` | Crea transacción manual |
| GET | `/needs-review` | Transacciones pendientes de categorizar |
| POST | `/reclassify` | Re-clasifica con IA las pendientes de revisión |
| PATCH | `/{tx_id}/category` | Corrige categoría + guarda regla |
| POST | `/{tx_id}/split-confirm` | Confirma que ingresos son reintegros de gasto compartido |
| DELETE | `/{tx_id}` | Elimina transacción |

### Sync — `/api/sync`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/gmail` | Sincroniza emails de pago desde Gmail |
| POST | `/mp` | Sincroniza movimientos de Mercado Pago |
| POST | `/csv` | Importa estado de cuenta MP (CSV, máx 5MB) |
| GET | `/status` | Estado de todas las conexiones |
| POST | `/plaid/link_token` | Obtiene link token de Plaid para el widget |
| POST | `/plaid/exchange_token` | Intercambia public token → access token |
| POST | `/plaid/sync` | Sincroniza transacciones desde Plaid |
| GET | `/prometeo/providers` | Lista bancos disponibles en Prometeo |
| POST | `/prometeo/login` | Login al banco con credenciales del usuario |
| POST | `/prometeo/sync` | Sincroniza movimientos bancarios vía Prometeo |

### Insights — `/api/insights`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/dolar` | Cotización dólar blue/oficial (cache 10 min, dolarapi.com) |
| GET | `/categories` | Desglose de gastos del mes por subcategoría |
| GET | `/payment-methods` | Desglose de gastos por medio de pago |
| GET | `/month` | Insights del mes: proyecciones por franja, comercios frecuentes, días hasta cobro |
| GET | `/summary` | Resumen comparativo últimos 3 meses |
| GET | `/dashboard` | Dashboard completo: presupuesto + resumen inversiones |

### Advisor — `/api/advisor`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/patterns` | Patrones de gasto del mes (top por frecuencia y monto) |
| POST | `/advice` | Consejo IA personalizado por franja (gustos/necesidades/ahorro) |

### Chat — `/api/chat`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `` | Mensaje al asesor IA (incluye historial de conversación) |
| GET | `/starters` | Preguntas sugeridas para iniciar el chat |

El chat recibe contexto financiero completo: ingresos, gastos, historial 6 meses, top comercios, metas, cartera.

### Goals — `/api/goals`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `` | Lista metas con submetas anidadas y % progreso |
| POST | `` | Crea nueva meta (con parent_id para submeta) |
| POST | `/{goal_id}/contribute` | Suma monto a una meta |
| DELETE | `/{goal_id}` | Elimina meta y sus submetas |
| GET | `/recurring` | Lista gastos fijos con total mensual comprometido |
| POST | `/recurring` | Crea gasto fijo o cuotas |
| DELETE | `/recurring/{item_id}` | Elimina gasto fijo |

### Investments — `/api/investments`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/upload` | Sube CSV/XLSX de broker (detecta formato automáticamente) |
| POST | `/manual` | Agrega compra/venta manual |
| POST | `/refresh-prices` | Fuerza actualización de precios en tiempo real |
| GET | `/holdings` | Posiciones abiertas con precio actual y P&L no realizado |
| GET | `/history` | Historial completo de compras/ventas |
| GET | `/summary` | Resumen total: invertido, valor actual, P&L, por tipo, vs MERVAL |
| GET | `/closed` | Detalle de P&L realizado por posición vendida |
| GET | `/timeline` | Evolución histórica de la cartera (mark-to-market) |
| GET | `/price-history/{ticker}` | Historial de precio de un activo + transacciones propias |

### Academy — `/api/academy`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `` | Contenido educativo priorizado por perfil del usuario |

Responde con: `recommended` (hasta 4 topics según perfil), `categories` (todos los topics organizados), `glossary`.

---

## 7. Servicios del backend

### `ai_provider.py` — Abstracción de IA

Selecciona Gemini o Claude según `AI_PROVIDER` en la config. Expone tres funciones:

**`classify(merchant, amount, source)`**
- Clasifica el gasto en necesidades/gustos/ahorro
- Devuelve: `{category, subcategory, confidence, rule_used, ai_reason}`
- Tiene cooldown de 5 minutos si se agota la cuota de la API

**`get_advice(patterns, focus, income)`**
- Genera consejo textual para una franja específica
- Fallback a `_rule_based_advice()` si IA no disponible

**`chat(message, history, financial_context)`**
- Conversación con el asesor financiero
- Sistema prompt: marco de tres prioridades (deudas → fondo de emergencia → inversión)
- Tono rioplatense informal
- Historial de hasta 10 turnos anteriores

**Modelos usados:**
- Gemini: `gemini-2.5-flash-lite` (classify), `gemini-2.5-flash` (advice, chat)
- Claude: `claude-sonnet-4-6` (todos los usos)

### `classifier.py` — Pipeline de clasificación

1. Busca en reglas del usuario (prioridad máxima, case-insensitive)
2. Busca en 42 reglas globales predefinidas (Rappi, Spotify, SUBE, EDENOR, etc.)
3. Si confianza < 85%, llama a la IA
4. Si IA devuelve confianza ≥ 85%, usa ese resultado
5. Si no, marca `needs_review = True`

### `alert_engine.py` — Motor de alertas

Se ejecuta en background después de cada sync. Genera alertas cuando:
- Gasto ≥ 90% del límite de franja → alerta `critical`
- Gasto ≥ 75% del límite → alerta `warning`
- Proyección a fin de mes supera el límite → alerta `projection`

Si Claude está configurado, agrega consejo personalizado con los gastos reales.

### `dedup.py` — Detección de duplicados

Detecta duplicados cross-source (ej: el mismo pago aparece en Gmail Y en MP):
- Compara merchant, monto y fecha (tolerancia de ±2 días)
- Marca como `is_duplicate = True` para excluirlos del presupuesto

### `splits.py` — Gastos compartidos

Detecta cuando un ingreso en MP o Gmail podría ser el reintegro de un gasto:
- Busca ingresos de monto similar a gastos recientes del mismo período
- Sugiere marcar el ingreso como `is_reimbursement = True`
- Confirmar el split con `/api/transactions/{tx_id}/split-confirm`

### `prices.py` — Precios de mercado

- **Acciones:** Yahoo Finance via yfinance (`yf.download`)
- **Crypto:** CoinGecko API (USD, convierte a ARS con blue rate)
- **Dólar blue:** dolarapi.com (cache 10 min en insights.py)
- **Benchmark MERVAL:** `^MERV` en Yahoo Finance para comparar retorno de cartera
- Cache en tabla `investment_price` para no pegar a Yahoo en cada request

### `investment_parser.py` — Parser de brokers

Detecta automáticamente el formato del CSV/XLSX y parsea:
- Cocos Capital
- Invertir Online (IOL)
- Bull Market Brokers
- Exportaciones genéricas (con columnas estándar)

### `recurring.py` — Gastos fijos automáticos

Aplica automáticamente los gastos fijos registrados al presupuesto del mes actual (`apply_recurring`). Idempotente: trackea `last_applied_month` para no aplicar dos veces.

### `seed.py` — Datos demo

Genera transacciones ficticias realistas para los últimos 3 meses cuando `DEMO_MODE=True` y la tabla de transacciones está vacía. Incluye comercios reales argentinos (Rappi, Carrefour, Spotify, etc.).

---

## 8. Frontend SPA

SPA de una sola página con routing hash-based. Sin build step — JavaScript vanilla directo.

### Routing (`app.js`)

```
/#dashboard       → dashboard.js
/#transactions    → transactions.js
/#insights        → insights.js
/#chat            → chat.js
/#goals           → goals.js
/#investments     → investments.js
/#settings        → settings.js (conexiones e integraciones)
/#academy         → academy.js
/#connections     → settings.js
```

### Estado global

Mantenido en `App.state`:
- `user`: datos del usuario autenticado
- `budget`: presupuesto del mes actual
- Actualizado en cada navegación

### `api.js` — Cliente HTTP

Wrappers para todos los endpoints del backend. Maneja errores, serializa JSON, incluye cookies automáticamente. Funciones clave:

- `API.budget()`, `API.updateBudgetSettings()`
- `API.listTransactions()`, `API.addTransaction()`, `API.correctCategory()`
- `API.syncGmail()`, `API.syncMP()`, `API.uploadCSV()`
- `API.listHoldings()`, `API.getSummary()`, `API.uploadInvestmentCSV()`
- `API.chat()`, `API.getInsights()`, `API.getDolar()`

### `settings.js` — Configuración e integraciones

Construye cards para cada fuente de datos:
- **Gmail:** estado conexión, botón sincronizar, OAuth flow
- **Mercado Pago:** estado, sincronizar wallet + CSV upload
- Budget settings: sliders de % de franjas, sueldo, día de cobro

**Plaid y Prometeo:** removidos del todo de la UI de Configuración (no solo ocultos) —
por ahora no se pueden conectar. Se sacaron las cards, los flujos de conexión
(`_buildPlaidCard`, `_initPlaidLink`, `_openPlaidLink`, `_buildPrometeoCard`,
`_initPrometeoLink`) y los wrappers de `api.js` (`getPlaidLinkToken`,
`exchangePlaidToken`, `syncPlaidTransactions`, `listPrometeoProviders`,
`prometeoLogin`, `syncPrometeoTransactions`). El backend y los endpoints
(`/sync/plaid/*`, `/sync/prometeo/*`) quedan intactos por si se retoman más
adelante — ver también la nota sobre el aviso de phishing de Google Safe
Browsing que motivó ocultar Prometeo originalmente.

### Service Worker (`sw.js`)

Cache name actual: `guita-v12` — bump en cada cambio de assets estáticos, ver `sw.js`

Estrategia:
- **Cache-first:** assets estáticos (`/static/`, `sw.js`, favicons)
- **Network-first:** todas las requests a `/api/`
- Al activar: elimina caches de versiones anteriores (nombre no coincide)
- Navegación SPA: retorna `index.html` en cache para rutas no-API

### Design system (`style.css`)

Identidad de marca (Manual de Marca Guita Coach v3.0): tipografía Montserrat
(pesos Light/Regular/Medium/SemiBold/Bold), monocromía estricta — negro
absoluto cálido/grafito (`--bg: #121110`) + blanco puro + escala de grises
cubren 80-90% de cada pantalla. Magenta eléctrico (`--gold: #E91E8C`) es el
único acento de marca (CTAs, estado activo, links). Colores funcionales
(10-20% máx, nunca decorativos): azul niebla / amarillo suave / verde suave
para las franjas necesidades/gustos/ahorro, rosa coral para alertas. No hay
selector de temas — la marca exige una sola paleta, no variantes.

Íconos: sin emojis como íconos estructurales (ver `static/js/icons.js`) —
un set propio de SVG lineales (stroke 1.75px, trazos consistentes) reemplaza
los pictogramas de color que se usaban antes en botones, gates y estados
vacíos, para evitar la estética genérica de "UI generada por IA".

Variables CSS personalizadas:
```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1)   /* Quart out */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)  /* Quart in-out */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)   /* Bottom sheet */
--transition:  .18s cubic-bezier(0.23, 1, 0.32, 1)
```

Principios aplicados (Emil Kowalski):
- Botones: `transform: scale(0.97)` en `:active`, transiciones por propiedad (no `all`)
- Modales: entrada con `scale(0.96) translateY(12px)` → `scale(1) translateY(0)`
- Toasts: entran/salen por el mismo borde inferior (`translateY(calc(100% + 32px))`)
- Bottom sheet: clase CSS `.open` + `requestAnimationFrame` para triggear transición después de `display:block`

---

## 9. Integraciones externas

### Gmail OAuth

1. Usuario va a `GET /api/auth/gmail` → redirige a Google con scope `gmail.readonly`
2. Google llama `GET /api/auth/gmail/callback?code=...`
3. Backend intercambia código por tokens, guarda en `connections`
4. `POST /api/sync/gmail` → `fetch_payment_emails()` → parsea emails de pago → `_save_transactions()`

Parsing de emails: busca patrones de monto en el cuerpo (expresiones regulares por banco/fintech AR).

### Mercado Pago OAuth

1. `GET /api/auth/mp` → redirige a MP con scope payments
2. Callback → guarda tokens en `connections`
3. `POST /api/sync/mp` → `fetch_movements()` → movimientos de los últimos 90 días

También soporta **login social** con MP: `GET /api/auth/mp/login` crea cuenta con el email del perfil de MP.

### Prometeo (bancos argentinos)

Modelo de credencial-sharing (no OAuth):
1. Usuario ingresa su usuario y contraseña del banco en el modal de Prometeo
2. Backend llama `POST /login/` en la API de Prometeo con esas credenciales
3. Prometeo devuelve `session_key` → se guarda en `connections.access_token`
4. `POST /api/sync/prometeo/sync` → fetch de cuentas (`/account/`) → movimientos por cuenta (`/movement/`)

Bancos soportados: los disponibles en el ambiente (sandbox o producción) de Prometeo.

### Plaid (bancos internacionales)

Flujo estándar Plaid Link:
1. `POST /api/sync/plaid/link_token` → crea link token
2. Frontend carga el widget de Plaid con ese token
3. Usuario completa el flujo en el widget
4. Frontend envía `public_token` a `POST /api/sync/plaid/exchange_token`
5. `POST /api/sync/plaid/sync` → transacciones de últimos 90 días

### Yahoo Finance / CoinGecko

- Precios de acciones: `yfinance.download(ticker, period="1d")`
- Historial para timeline: `yfinance.download(ticker, start=date, end=today)`
- Crypto: CoinGecko API `/simple/price` y `/coins/{id}/market_chart`
- Inferencia de tipo de activo: tickers de crypto conocidos (BTC, ETH, etc.) → `asset_type = "crypto"`; resto → `asset_type = "stock"`

---

## 10. Motor de IA

### Sistema de tres prioridades (chat)

El asesor responde SIEMPRE siguiendo este orden:
1. **Cancelar deudas de alta tasa** (> 5% mensual: tarjetas, préstamos)
2. **Fondo de emergencia** (6 meses de gastos, en FCI money market)
3. **Inversión diversificada** (CEDEARs, bonos CER, FCI — máx 30% en un instrumento)

### Contexto financiero inyectado al chat

- Mes actual, ingresos, gastos, balance
- Historial de 6 meses (ingresos y gastos por mes)
- Top 6 comercios del mes y top 8 de 6 meses
- Desglose por subcategoría del mes
- Metas de ahorro activas
- Gastos fijos mensuales comprometidos
- Resumen de cartera de inversiones (si tiene)

### Clasificación con reglas globales

42 reglas predefinidas para el contexto argentino. Ejemplos:
- `rappi`, `pedidosya`, `glovo` → gustos / Delivery
- `spotify`, `netflix`, `disney`, `hbo` → gustos / Streaming
- `sube`, `cabify`, `uber` → necesidades / Transporte
- `coto`, `dia`, `carrefour`, `jumbo`, `disco` → necesidades / Supermercado
- `edenor`, `metrogas`, `aysa` → necesidades / Servicios
- `claro`, `personal`, `movistar` → necesidades / Servicios
- `zara`, `h&m`, `adidas` → gustos / Compras

Las reglas del usuario (aprendidas de correcciones manuales) tienen prioridad máxima.

---

## 11. Seguridad

### Contraseñas

PBKDF2-SHA256 con 200.000 iteraciones. Implementado en stdlib Python (sin dependencias externas).

```
formato: pbkdf2_sha256$200000$<salt_hex>$<digest_hex>
```

### Sesiones

- Cookie `gc_session` (HttpOnly, SameSite=Lax, Secure en HTTPS)
- Token: `secrets.token_urlsafe(32)` (256 bits de entropía)
- Duración: 30 días
- Almacenada en tabla `user_sessions`
- En `DEMO_MODE=True`, si no hay sesión, retorna el usuario 1

### OAuth CSRF

State parameter generado con `secrets.token_urlsafe(16)`, verificado contra cookie `oauth_state` en el callback. Previene Login CSRF.

### Tokens OAuth

Almacenados en `connections.access_token` en texto plano.  
**TODO para producción:** cifrar con clave derivada de `SECRET_KEY`.

---

## 12. Service Worker y PWA

### Estrategia de cache

```javascript
const CACHE = 'guita-v8';  // Bump para invalidar cache en producción

// Cache-first para assets estáticos
if (url.pathname.startsWith('/static/') || url.pathname === '/sw.js') {
    return cacheFirst(request);
}

// Network-first para API
if (url.pathname.startsWith('/api/')) {
    return networkFirst(request);
}

// Navegación SPA: index.html desde cache
return caches.match('/') || fetch(request);
```

### Invalidación de cache

Para forzar recarga de assets en producción:
1. Bump del nombre de cache (ej: `guita-v8` → `guita-v9`)
2. Bump de versión en query params de assets en `index.html` (ej: `?v=11` → `?v=12`)

Al activar el nuevo SW, se eliminan todos los caches que no coincidan con el nombre actual.

### Ruta de privacidad

`/privacidad` tiene ruta explícita en FastAPI ANTES del catch-all SPA, con `Cache-Control: no-store` para que el SW nunca lo almacene.

---

## 13. Despliegue

### Producción — Railway

URL: `https://guita-coach-production.up.railway.app`

```
Procfile (o start command): uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Railway inyecta automáticamente `DATABASE_URL` apuntando a PostgreSQL.  
Al iniciar, `init_db()` crea todas las tablas y aplica migraciones aditivas.

### Alternativa — Vercel (serverless)

`api/index.py`:
```python
from app.main import app
```

`vercel.json`:
```json
{
  "version": 2,
  "builds": [{"src": "api/index.py", "use": "@vercel/python", "config": {"maxLambdaSize": "50mb"}}],
  "routes": [{"src": "/(.*)", "dest": "/api/index.py"}]
}
```

**Limitación Vercel:** background tasks (`BackgroundTasks`) pueden ser cortados al terminar el request. Requiere base de datos externa (Neon.tech, Supabase u otro PostgreSQL).

### Desarrollo local

```bash
# Instalar dependencias
pip install -r requirements.txt

# Configurar .env
cp .env.example .env  # editar variables

# Iniciar servidor (DEMO_MODE=True para usar sin auth)
uvicorn app.main:app --reload --port 8000
```

Con `DEMO_MODE=True`:
- Auto-login como usuario 1 (sin necesidad de registrarse)
- Siembra datos demo al primer inicio (si no hay transacciones)

---

## 14. Flujos de usuario clave

### Onboarding

1. Registro con email/password (o login con Google)
2. Pantalla de bienvenida con formulario de onboarding:
   - Nombre
   - Ingreso mensual (o marcar "ingreso variable")
   - % de cada franja (debe sumar 100%)
   - Día del mes en que cobra
3. Al completar: `POST /api/budget/onboarding` → `onboarding_done = True`
4. Redirige a Dashboard

### Importación de transacciones

**Vía Gmail:**
1. Conectar cuenta en Configuración → botón "Conectar Gmail"
2. OAuth flow con Google (scope: gmail.readonly)
3. Botón "Sincronizar Gmail" → parsea últimos 90 días de emails de pago
4. Cada nuevo email → clasificación automática → aparece en Transacciones

**Vía Mercado Pago:**
1. Conectar en Configuración → "Conectar Mercado Pago"
2. OAuth MP → accede a los movimientos de la cuenta
3. CSV alternativo: descargar estado de cuenta de MP → subir en Configuración

**Vía banco (Prometeo):**
1. Configuración → "Conectar Banco" → seleccionar banco de la lista
2. Ingresar usuario y contraseña del home banking
3. Prometeo autentica y devuelve session_key
4. Sync automático de movimientos de los últimos 90 días

### Presupuesto y alertas

- El dashboard muestra un balance de caja editable a mano, la distribución
  del gasto mensual por franja (necesidades/gustos/ahorro), una barra de
  límite de gasto mensual, un donut de distribución y un gráfico de barras
  apiladas con el gasto de los últimos meses. Selector de mes para ver
  meses anteriores.
- Las alertas se generan automáticamente después de cada sync (y, desde la
  auditoría de agosto 2026, también al agregar una transacción manual —
  antes ese endpoint llamaba a `run_alert_engine` sin `await` y la alerta
  nunca se generaba)
- Al llegar al 75% del límite: warning
- Al llegar al 90%: crítico con consejo IA
- Proyección fin de mes: si la velocidad de gasto actual supera el límite

### Corrección de categoría

1. En Transacciones, tap en una transacción
2. Seleccionar categoría y subcategoría correctas
3. Backend guarda una `CategoryRule` con el pattern del merchant
4. Próximas transacciones del mismo comercio se clasifican automáticamente

### Chat financiero

1. Desde cualquier pantalla: ícono de chat en la nav
2. Preguntas sugeridas o mensaje libre
3. El asesor responde con los números reales del usuario
4. Sigue el framework: deudas → fondo de emergencia → inversión

---

## 15. Diferenciación competitiva

### vs. ChatGPT / Google Finance

| Característica | Guita Coach | ChatGPT | Google Finance |
|---|---|---|---|
| Datos reales del usuario | Sí (Gmail, MP, bancos) | No (solo lo que el usuario pega) | Solo mercado |
| Adaptado a Argentina | Sí (ARS, blue, MERVAL, CEDEARs, bancos AR) | Parcialmente | No |
| Clasificación automática | Sí (IA + reglas) | Manual | No aplica |
| Presupuesto 50/30/20 | Sí (configurable) | No | No |
| Detección duplicados | Sí (cross-source) | No | No |
| Sin fricción de datos | Importa solo (OAuth) | El usuario tiene que copiar/pegar | Solo mercado |
| Framework de prioridades | Deudas → Fondo → Inversión | Genérico | No aplica |
| Historial personal | Sí (meses de datos propios) | No persiste | Solo cotizaciones |
| Cartera de inversiones | Sí (con precios en tiempo real) | No | Sí, pero sin datos propios |
| PWA / offline | Sí | No | Parcial |

### Propuesta de valor única

**"El único que sabe cuánto gastaste realmente."**

ChatGPT puede dar consejos financieros genéricos, pero no sabe que gastaste $45.000 en Rappi este mes o que tu límite de gustos vence en 3 días. Guita Coach conecta con tus cuentas reales y habla con los números, no con generalidades.

**Específico para Argentina:**
- Entiende el contexto de inflación (presupuesto en ARS, no en USD)
- Dólar blue siempre visible
- Bancos argentinos integrados (Prometeo) — backend listo, UI removida de Configuración por ahora (ver nota en sección 8, `settings.js`)
- Reglas de clasificación con los comercios reales (SUBE, Claro, EDENOR, etc.)
- Inversiones: CEDEARs, bonos CER, benchmark vs MERVAL

---

*Última actualización: agosto 2026*  
*Stack: FastAPI + SQLAlchemy + Vanilla JS + Railway*

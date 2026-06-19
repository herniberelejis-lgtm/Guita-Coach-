# Guita Coach - Estado del Proyecto (2026-06-18)

## 📋 Resumen Ejecutivo

**Estado**: En desarrollo con problemas críticos de cache/deploy
**Deployment**: Railway (guita-coach-production.up.railway.app)
**Repo**: GitHub (Guita-Coach/guita-coach)
**Stack**: FastAPI + SQLAlchemy + PostgreSQL + Vanilla JS + PWA

---

## ✅ FUNCIONALIDADES COMPLETADAS

### 1. Autenticación & OAuth
- ✅ Login/Registro local (email + password)
- ✅ Google OAuth integration
- ✅ Mercado Pago OAuth integration
- ✅ Session management con state binding para CSRF protection
- ✅ Logout functionality

### 2. Dashboard
- ✅ Presupuesto (Necesidades/Gustos/Ahorro)
- ✅ Resumen mensual con charts
- ✅ Banners de conexión para Gmail y Mercado Pago
- ✅ Banner de gastos fijos (gastos fijos agregados)

### 3. Transacciones
- ✅ Upload de movimientos desde banco
- ✅ Categorización automática con Gemini AI
- ✅ Historial con filtros
- ✅ Split de transacciones
- ✅ Editar categorías manualmente

### 4. Integraciones Externas
- ✅ Gmail sync (lecturas de confirmaciones de pago)
- ✅ Mercado Pago API (obtener movimientos)
- ✅ Gemini AI (clasificación de gastos)

### 5. Metas & Gastos Fijos
- ✅ CRUD de metas de ahorro
- ✅ Progreso visual de metas
- ✅ CRUD de gastos fijos (Necesidades/Gustos/Ahorro)
- ✅ Dashboard banner mostrando gastos fijos

### 6. Settings
- ✅ Configuración de presupuesto
- ✅ Conexiones (Gmail, Mercado Pago)
- ✅ Import CSV de Mercado Pago
- ✅ Gastos fijos management

### 7. Design & UI
- ✅ Tema Zen (beige/salvia/terracota)
- ✅ Login screen con info panel + form (dos columnas)
- ✅ Responsive design (desktop + mobile)
- ✅ PWA con service worker
- ✅ Manifest.json con iconos

---

## ❌ FUNCIONALIDADES INCOMPLETAS / CON PROBLEMAS

### 1. **CRÍTICO: Inversiones - Página muestra TABS en lugar de vista unificada**
   
   **Problema**: 
   - Página de inversiones sigue mostrando 3 tabs (Posiciones, Historial, Subir)
   - Debería mostrar UNA SOLA página con todo el contenido junto
   - El archivo investments.js fue reescrito pero no se refleja en el navegador
   
   **Causa Probable**: 
   - Service worker o cache HTTP de Railway sirviendo versión vieja
   - El navegador cachea agresivamente el HTML/JS
   
   **Archivo Correcto Existe**: 
   - `/static/js/investments.js` (línea 1 dice: "single unified view with holdings, history, and CSV upload")
   - Contiene `_loadAllContent()` que agrega upload + holdings + history sin tabs
   
   **Qué Debería Verse**:
   ```
   Inversiones
   ← [back button]
   
   Subir movimientos
   [Upload form con drag & drop]
   
   Posiciones abiertas
   [Holdings table]
   
   Historial de transacciones
   [History table]
   ```
   
   **Estado de CSV Upload**: 
   - Endpoint `/api/investments/upload` existe y está bien codificado
   - Pero usuario NO ve el form porque todavía ve tabs
   - Una vez que se cargue investments.js correcto, debería funcionar

### 2. Login Form Colors
   - ✅ Arreglado: Inputs ahora son transparentes con border-bottom (línea 221-237 en style.css)
   - ✅ Arreglado: Botones Google/MP son transparentes con borde (línea 572-580 en style.css)
   - ✅ CSS variables añadidas al tema zen (línea 621-631 en style.css)
   - ❓ Puede no verse por cache

---

## 🗂️ ESTRUCTURA DEL PROYECTO

```
guita-coach/
├── app/
│   ├── main.py                          # FastAPI app + routes principales
│   ├── models.py                        # SQLAlchemy models (User, Investment, etc)
│   ├── database.py                      # DB connection & session
│   ├── security.py                      # JWT, password hashing, current_user
│   ├── routers/
│   │   ├── auth.py                      # Login, register, OAuth (Google, MP)
│   │   ├── transactions.py              # Transacciones, categorización
│   │   ├── budget.py                    # Presupuesto, insights
│   │   ├── goals.py                     # Metas y gastos fijos
│   │   ├── investments.py               # ✅ Endpoint /api/investments/upload
│   │   └── sync.py                      # Gmail, MP sync, CSV import
│   ├── services/
│   │   ├── investment_parser.py         # Parse CSV/XLSX (Cocos, Invertir Online, Bull Market)
│   │   ├── investment_calculator.py     # Weighted avg cost, P&L calculations
│   │   ├── ai_classifier.py             # Gemini AI para categorías
│   │   └── [otros servicios]
│   └── .env                             # Variables de entorno (DB, API keys)
│
├── static/
│   ├── index.html                       # Single page app
│   ├── manifest.json                    # PWA manifest
│   ├── sw.js                            # Service worker
│   ├── css/
│   │   └── style.css                    # Estilos (tema zen, responsivo)
│   └── js/
│       ├── app.js                       # App controller, routing
│       ├── api.js                       # Fetch wrapper para /api endpoints
│       ├── auth.js                      # Login/registro/logout
│       ├── dashboard.js                 # Dashboard + banners
│       ├── transactions.js              # Transacciones UI
│       ├── investments.js               # ❌ PROBLEMA: Todavía muestra tabs
│       ├── goals.js                     # Metas
│       ├── settings.js                  # Configuración
│       ├── insights.js                  # Proyecciones
│       └── chat.js                      # Chat con IA
│
├── requirements.txt                     # Dependencies (fastapi, sqlalchemy, openpyxl, etc)
├── Dockerfile                           # Build image para Railway
├── .env.example                         # Template para variables de entorno
└── .gitignore                           # Archivos ignorados (incluye .env)
```

---

## 🔧 ÚLTIMOS COMMITS (últimas 10 sesiones)

```
baadef0 - fix: auto-unregister old service workers on page load
22c25ef - style: remove white backgrounds, use transparent inputs and buttons
65cd896 - chore: version bump to force cache invalidation
0d8b308 - fix: restore investments.js with unified view and bump version
b51babe - style: improve form input contrast and visibility
88fd32a - fix: add cache busters to force fresh assets load
425ba4b - fix: prevent clearing container in investments load methods
4aec13b - feat: unified investments page and consistent login colors
...
```

---

## 🚨 PROBLEMA CRÍTICO: Cache de Railway/Navegador

### Síntomas
- Cambios en `static/js/investments.js` no se reflejan en producción
- Usuario ve tabs aunque el código nuevo no tiene tabs
- Versión v=3 en query params no ayudó

### Intentos Fallidos
1. ✗ Agregar query params (?v=2, ?v=3)
2. ✗ Renombrar archivo (investments-unified.js → investments.js)
3. ✗ Cambiar Dockerfile con comentarios
4. ✗ Actualizar manifest.json

### Soluciones Pendientes

**Opción A: Limpiar Cache del Cliente (Usuario)**
```
1. F12 → Application → Service Workers → Unregister
2. F12 → Storage → Clear site data
3. Ctrl+Shift+Supr → Limpiar datos navegación (todos)
4. Cierra navegador completamente
5. Abre pestaña nueva en guita-coach-production.up.railway.app
6. Ctrl+Shift+R (hard refresh)
```

**Opción B: Forzar Cache Invalidation en Railway (NO PROBADO)**
- Crear `railway.json` con build config
- Agregar timestamp en tiempo de build al HTML
- Trigger manual rebuild en Railway dashboard

**Opción C: Cambiar estrategia de assets**
- Usar versionado de build (dist/js/investments.abc123.js)
- o usar revisioning automático
- Requiere cambios en backend para servir assets con hash

---

## 📝 INVERSIONES - DETALLES TÉCNICOS

### Backend (`app/routers/investments.py`)

```python
POST /api/investments/upload
- Input: FormData con archivo CSV/XLSX
- Output: { ok: bool, broker: str, fetched: int, saved: int }
- Autenticación: Requiere user loggeado (JWT)
- Parsea: Cocos Capital, Invertir Online, Bull Market
- DB: Crea Investment + InvestmentTransaction records
- P&L: Calcula weighted average cost y P&L

GET /api/investments/holdings
- Retorna: Lista de posiciones abiertas con P&L
- Requiere: JWT auth

GET /api/investments/history
- Retorna: Historial completo de transacciones
- Requiere: JWT auth

GET /api/investments/summary
- Retorna: Resumen de portfolio (total_invested, total_current_value, etc)
```

### Frontend (`static/js/investments.js`)

**Estado Actual**: Código nuevo EXISTE pero no se carga

**Estructura esperada**:
```javascript
Investments = {
  async render()              // Entry point
  async _loadAllContent()     // Carga 3 secciones
  async _loadHoldings()       // Tabla de posiciones
  async _loadHistory()        // Tabla de historial
  _buildUploadForm()          // Form de upload
  async _handleFileSelect()   // Procesa file input
}
```

**API calls desde frontend**:
- `API.uploadInvestmentCSV(file)` → `/api/investments/upload`
- `API.getInvestmentHoldings()` → `/api/investments/holdings`
- `API.getInvestmentHistory()` → `/api/investments/history`
- `API.getInvestmentSummary()` → `/api/investments/summary`

---

## 📊 BROKER SUPPORT

### Soportados
1. **Cocos Capital**: `movimientos.csv`
   - Columns: Fecha, Instrumento, Cantidad, Precio, Operación, Comisión
   
2. **Invertir Online**: `movimientos.xlsx` o `.csv`
   - Columns: Fecha, Título, Cantidad, Precio, Tipo, Comisión
   
3. **Bull Market**: `movimientos_cuenta.csv`
   - Columns: Fecha, Ticker, Cantidad, Precio, Tipo

### Parser (`app/services/investment_parser.py`)
- Auto-detecta broker por nombre/estructura de archivo
- Retorna: `(broker_name, [items])`
- Cada item: `{date, ticker, tx_type, quantity, price, broker, csv_reference}`

---

## 🎨 COLORES & THEME (Tema Zen)

### CSS Variables (línea 621-631 en style.css)
```css
--bg:                   #F5F1E8  /* Beige/Arena - fondo principal */
--navy3:                #E5DFD0  /* Beige oscuro - elementos */
--gold (color-accent):  #C97B4A  /* Terracota - acentos, botones */
--white (color-text):   #3D4A3F  /* Verde bosque - texto principal */
--muted (text-secondary):#8A9182 /* Verde gris - texto secundario */
--accent-primary:       #84A98C  /* Verde salvia - alternativo */
```

### Estado Actual de Colores
- ✅ Login background: beige uniforme
- ✅ Inputs: transparentes con border-bottom beige
- ✅ Botones submit: terracota
- ✅ Botones sociales: transparentes con borde
- ❓ Puede no verse por cache

---

## 🔐 AUTENTICACIÓN & SEGURIDAD

### OAuth State Binding (CSRF Protection)
- Google OAuth state guardado en SessionCookie (no en memory dict)
- Mercado Pago state igualmente bound a session
- Cambio en `app/routers/auth.py` línea ~120-150

### JWT Tokens
- Access token: 24 horas
- Refresh token: 7 días
- Guardados en httpOnly cookies

### Secrets Management
- `.env` tiene: DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, MP_CLIENT_ID/SECRET, GEMINI_API_KEY
- `.env.example` como template
- `.gitignore` excluye `.env`

---

## 📱 PWA & Service Worker

### service worker (`static/sw.js`)
- Cache estrategia: Network first, fallback cache
- Archivos cacheados: CSS, JS, algunos assets
- **PROBLEMA**: Puede estar sirviendo versión vieja

### manifest.json
- App name: "Guita Coach"
- Icons: /static/icons/icon.svg (SVG única fuente de verdad)
- Display: standalone
- Theme color: #F5F1E8

---

## 🚀 DEPLOYMENT (Railway)

### Dockerfile
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
COPY static/ static/
COPY .env* ./
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### .env en Railway
- DATABASE_URL: PostgreSQL en Railway
- Otros secrets: Configurados en Railway dashboard

### Build Issues Previos
- ✅ Arreglado: Dockerfile COPY static/ estaba faltando
- ✅ Agregado: Explicit COPY para asegurar archivos estáticos

---

## 📋 TODO - PRÓXIMOS PASOS

### Prioridad 1 (BLOQUEADORES)
- [ ] **Resolver cache de investments.js**
  - Opción A: Limpiar cache del cliente (usuario)
  - Opción B: Implementar versionado de assets con hash
  - Opción C: Revisar si Railway tiene cache intermedio

- [ ] **Verificar investments page después de limpiar cache**
  - Debe mostrar: Upload form + Holdings table + History table
  - SIN tabs (Posiciones/Historial/Subir)

### Prioridad 2 (Validación)
- [ ] Testear CSV upload end-to-end
  - Archivo: Cocos Capital, Invertir Online, Bull Market
  - Verificar que se guardan transacciones
  - Verificar que se calcula P&L correctamente

- [ ] Verificar colores en login (después de limpiar cache)
  - Inputs deben ser transparentes con borde
  - Botones deben ser transparentes con borde
  - Todo debe ser beige/verde en la paleta

### Prioridad 3 (Features)
- [ ] Dashboard: Mostrar resumen de inversiones (si hay posiciones)
- [ ] Agregar precios de mercado (actualmente precios = 0)
  - Opción: BYMA API, Yahoo Finance, o input manual
  - Actualmente deshabilitado por security concern

### Prioridad 4 (Polish)
- [ ] Mobile responsive: Verificar inversiones en mobile
- [ ] Accesibilidad: Tabbing, ARIA labels
- [ ] Performance: Optimize bundle size

---

## 🧪 TESTING

### Manual Testing Checklist
```
[ ] Login con email/password
[ ] Google OAuth flow
[ ] Mercado Pago OAuth flow
[ ] Logout
[ ] Dashboard loads
[ ] Transacciones: ver lista
[ ] Inversiones: ver form upload
[ ] CSV upload: Cocos Capital file
[ ] CSV upload: Invertir Online file
[ ] CSV upload: Bull Market file
[ ] Holdings: después de upload, ver posiciones
[ ] History: después de upload, ver movimientos
```

### Unit Tests
- ⚠️ No hay tests automáticos configurados actualmente
- Recomendado: pytest para backend, Playwright para E2E frontend

---

## 📚 REFERENCIAS

### Endpoints Críticos
- POST `/api/auth/register` - Registro
- POST `/api/auth/login` - Login
- GET `/api/auth/google/login` - Google OAuth
- GET `/api/auth/mp/login` - Mercado Pago OAuth
- POST `/api/investments/upload` - Upload archivo broker
- GET `/api/investments/holdings` - Posiciones abiertas
- GET `/api/investments/history` - Historial
- GET `/api/investments/summary` - Resumen

### Database Models (app/models.py)
- User
- Investment (ticker + broker + quantity + avg_cost)
- InvestmentTransaction (buy/sell transaction log)
- InvestmentPrice (price cache table)

---

## 💡 NOTAS IMPORTANTES

1. **Service Worker**: PWA está activado pero puede causar issues con cache
   - Nuevo código en `index.html` intenta auto-unregister, pero puede no ser suficiente

2. **Precios de Inversiones**: Actualmente 0.0
   - InvestmentPrice tabla está vacía
   - Precio update endpoint deshabilitado por security
   - Para testing: actualizar directamente en DB

3. **Gemini AI**: Usado para categorización automática
   - Requiere GEMINI_API_KEY en .env
   - Solo para transacciones, no para inversiones

4. **Mercado Pago**: Para OAuth y movimientos
   - No para pagos actualmente
   - Solo lectura de transacciones

---

## 🔗 Links Útiles

- **Railway Dashboard**: https://railway.app/ (manage app)
- **GitHub Repo**: https://github.com/Guita-Coach/guita-coach
- **Live App**: https://guita-coach-production.up.railway.app/
- **User Email**: herniberelejis@gmail.com

---

## Última Actualización
**Fecha**: 2026-06-18 22:50  
**Estado**: Esperando resolución de cache de investments.js  
**Bloqueador**: Service worker/Browser cache sirviendo versión vieja del archivo

# Especificación: Módulo de Inversiones para Guita Coach

**Fecha:** 2026-06-18  
**Alcance:** 3 fases (B → C → A)  
**Status:** Diseño aprobado

---

## 1. Visión General

Agregar capacidad de **seguimiento de portafolio de inversiones** a Guita Coach, permitiendo a usuarios argentinos con inversiones en bolsa (acciones, bonos, ETFs) rastrear su posición, calcular ganancias/pérdidas y visualizar el estado de sus inversiones integrado con su historial financiero personal.

**Usuarios objetivo:** Personas con inversiones en brokers argentinos (Cocos Capital, Invertir Online, Bull Market, etc.) que no hacen trading profesional pero quieren visibilidad sobre sus inversiones.

**Problema que resuelve:**
- Hoy el usuario tiene que checkear cada broker por separado
- No ve P&L calculado automáticamente
- No integra depósitos de inversión con el resto de sus finanzas

---

## 2. Requisitos Funcionales

### Fase B (MVP): CSV Upload + P&L Básico

#### 2.1 Upload y Detección de Broker

- Usuario sube archivo CSV desde su broker
- Sistema **auto-detecta** el broker (Cocos Capital, Invertir Online, Bull Market)
- Si no reconoce el formato, muestra error

**Brokers soportados inicialmente:**
- Cocos Capital
- Invertir Online  
- Bull Market

**Formato de salida esperado del CSV:**
```
fecha | tipo (compra/venta) | ticker | cantidad | precio | comisión (opcional)
```

#### 2.2 Parsing y Almacenamiento

Para cada transacción en el CSV:
1. Extrae: fecha, ticker, cantidad, precio, tipo (buy/sell)
2. Busca si existe `Investment` abierta para ese ticker
3. **Si es compra:**
   - Si no existe → crear `Investment` nueva
   - Si existe → actualizar `avg_cost` (promedio ponderado)
4. **Si es venta:**
   - Disminuye `quantity`
   - Si quantity = 0 → marca como closed
5. Crea registro en `InvestmentTransaction` (auditoría de todas las operaciones)

#### 2.3 Cálculo de P&L (Básico)

Para cada `Investment` abierta:
```
P&L no realizado = (precio_actual - avg_cost) × quantity
```

Para `Investment` cerrada (histórico):
```
P&L realizado = (precio_venta - avg_cost) × quantity_vendida
```

**P&L Total = P&L realizado (histórico) + P&L no realizado (holdings actuales)**

#### 2.4 Vinculación Semi-automática de Depósitos

Cuando usuario sube CSV:
- Sistema busca en `Transaction` (Gmail/MP) depósitos sin categoría a esos brokers
- Muestra sugerencias: "¿Vincular depósito de $10k del 15/1 a Cocos Capital?"
- Usuario confirma → crea relación `InvestmentTransaction.linked_transaction_id`

#### 2.5 UI - MVP

**Dashboard Principal:**
```
┌─────────────────────────────────┐
│ Posición financiera             │
├─────────────────────────────────┤
│ Dinero en caja:      $50,000    │
│ Valor inversiones:   $30,000    │
│ P&L inversiones:     +$5,000    │
│ Total neto:          $85,000    │
└─────────────────────────────────┘
```

**Panel "Inversiones":**

**Tab 1: Holdings Actuales**
```
Tabla:
Ticker | Cantidad | Costo prom | Precio act | Ganancia | %
GGAL   | 10       | $100       | $120       | +$200    | +20%
MERV   | 5        | $500       | $480       | -$100    | -4%
```

**Tab 2: Histórico Acumulado**
```
Tabla:
Fecha      | Tipo  | Ticker | Cantidad | Precio | Total | Estado
2024-01-15 | Compra| GGAL   | 10       | $100   | $1000 | Abierta
2024-06-10 | Venta | GGAL   | 8        | $120   | $960  | Cerrada (+$320)
```

**Tab 3: Resumen P&L**
```
P&L No realizado:  +$5,000
P&L Realizado:     +$2,500
P&L Total:         +$7,500
```

**Componente: Upload CSV**
1. Input file + drop zone
2. Detecta broker automáticamente
3. Preview de transacciones
4. Sugerencias de depósitos a vincular
5. Botón "Confirmar y sincronizar"

---

### Fase C: Integración BYMA (Datos de Mercado en Tiempo Real)

#### 2.6 Conexión con BYMA API

- Registrarse en BYMA y obtener API key (gratuita)
- Crear servicio `byma.py` que fetchee precios actuales
- Actualizar tabla `InvestmentPrice` (cache local)
- Reemplazar precios manuales con precios en tiempo real

**Frecuencia de actualización:**
- Update diario al abrir la app (si está conectada BYMA)
- Opcionalmente en tiempo real (si BYMA lo permite)

#### 2.7 Soportar múltiples monedas

- BYMA devuelve precios en ARS (acciones/bonos locales)
- Detectar si hay activos en USD (bonos dolarizados)
- Mostrar conversión (mostrar ambas monedas)

---

### Fase A: Detección Automática de Depósitos

#### 2.8 Pattern Matching en Transacciones

Cuando sincroniza Gmail/MP:
1. Busca keywords: "Cocos", "Invertir Online", "Bull Market", "depósito", "broker"
2. Si encuentra transacción sin categoría → crea sugerencia
3. Usuario confirma → marca como depósito de inversión

#### 2.9 UI - Sugerencias

En la vista de transacciones, mostrar overlay:
```
"¿Es este un depósito de inversión?"
☐ Cocos Capital
☐ Invertir Online
☐ Bull Market
☐ Otro
[Confirmar] [Descartar]
```

---

## 3. Requisitos No Funcionales

- **Seguridad:** Los CSVs no se guardan en disco (se parsean en memoria)
- **Performance:** Cálculo de P&L en caché, recalcula cuando hay cambios
- **Modularidad:** Código de inversiones separado, fácil de extender a Enfoque 2 (integración total)
- **UX:** Detección automática de broker para minimizar clicks del usuario

---

## 4. Estructura de Base de Datos

### Tabla: `investment`
```python
class Investment(Base):
    __tablename__ = "investment"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id"))
    broker = Column(String) # "cocos_capital", "invertir_online", "bull_market"
    ticker = Column(String) # "GGAL", "MERV", etc.
    quantity = Column(Float) # cantidad actual
    avg_cost = Column(Float) # costo promedio ponderado
    purchase_date = Column(Date) # fecha de primera compra
    status = Column(String) # "open", "closed"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Tabla: `investment_transaction`
```python
class InvestmentTransaction(Base):
    __tablename__ = "investment_transaction"
    
    id = Column(Integer, primary_key=True)
    investment_id = Column(Integer, ForeignKey("investment.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("user.id"))
    broker = Column(String)
    ticker = Column(String)
    tx_type = Column(String) # "buy", "sell"
    quantity = Column(Float)
    price = Column(Float)
    date = Column(Date)
    csv_reference = Column(String) # ref al CSV original (para auditoría)
    linked_transaction_id = Column(Integer, ForeignKey("transaction.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

### Tabla: `investment_price`
```python
class InvestmentPrice(Base):
    __tablename__ = "investment_price"
    
    id = Column(Integer, primary_key=True)
    ticker = Column(String, unique=True)
    price = Column(Float)
    currency = Column(String) # "ARS", "USD"
    last_updated = Column(DateTime)
```

---

## 5. Servicios y Módulos

### `app/services/investment_parser.py`
- Detecta broker por formato de CSV
- Parsea transacciones (maneja distintos formatos)
- Valida datos

### `app/services/investment_calculator.py`
- Calcula avg_cost (promedio ponderado)
- Calcula P&L realizado/no realizado
- Genera resúmenes

### `app/services/byma.py` (Fase C)
- Conecta con BYMA API
- Fetchea precios actuales
- Cachea en `investment_price`

### `app/routers/investments.py`
- `POST /api/investments/upload` — upload CSV
- `GET /api/investments/holdings` — lista de holdings
- `GET /api/investments/history` — histórico
- `GET /api/investments/summary` — P&L total
- `POST /api/investments/link-deposit` — vincula depósito

---

## 6. Flujos de Datos

### Flujo 1: Upload CSV → Holdings
```
User uploads CSV
    ↓
Auto-detect broker format
    ↓
Parse transactions (fecha, ticker, qty, price, type)
    ↓
For each transaction:
  - Find or create Investment
  - Update avg_cost (if buy)
  - Update quantity
  - Mark closed (if qty = 0)
  - Create InvestmentTransaction (audit)
    ↓
Show preview + deposit linking suggestions
    ↓
User confirms
    ↓
Save to DB
    ↓
Calculate P&L (with manual prices or BYMA)
```

### Flujo 2: Cálculo P&L
```
For each Investment (open):
  - Get avg_cost from DB
  - Get current_price (from BYMA or user input)
  - P&L = (current_price - avg_cost) × quantity
  
Sum all holdings:
  - Total no realizado = sum(P&L)
  
Get all closed Investments:
  - Total realizado = sum(P&L from history)

Total P&L = realizado + no realizado
```

---

## 7. Roadmap de Implementación

### Sprint 1 (Fase B.1): Estructura base + Upload
- [ ] Crear modelos (`Investment`, `InvestmentTransaction`, `InvestmentPrice`)
- [ ] Crear `investment_parser.py` (detecta Cocos, Invertir Online, Bull Market)
- [ ] Endpoint `POST /api/investments/upload`
- [ ] Test parser con CSVs reales

### Sprint 2 (Fase B.2): P&L + UI
- [ ] `investment_calculator.py` (cálculo P&L)
- [ ] Endpoints `GET /api/investments/holdings`, `/history`, `/summary`
- [ ] Frontend: Panel "Inversiones" con tabs
- [ ] Dashboard: resumen de posición

### Sprint 3 (Fase B.3): Vinculación de depósitos
- [ ] Detectar depósitos a brokers en transacciones
- [ ] Sugerencias UI
- [ ] Endpoint `POST /api/investments/link-deposit`

### Sprint 4 (Fase C): BYMA
- [ ] `byma.py` service
- [ ] Background job para actualizar precios
- [ ] Reemplazar precios manuales en UI

### Sprint 5 (Fase A): Detección automática
- [ ] Pattern matching en sync de Gmail/MP
- [ ] Sugerencias automáticas
- [ ] Refinamiento de patrones

---

## 8. Consideraciones de Migración a Enfoque 2

Cuando quiera integrar investiones en el flujo principal (Enfoque 2):

1. No modificar `InvestmentTransaction` — seguirá siendo la fuente de verdad
2. Crear vista `FinancialSummary` que agregue:
   - Transacciones de gastos (del historial actual)
   - Transacciones de inversión (de `InvestmentTransaction`)
   - Cálculo de P&L total
3. Dashboard puede mostrar ambas perspectivas (Enfoque 1 y 2 juntas)

**No requiere cambios disruptivos**, solo nuevas vistas de agregación.

---

## 9. Validación y Testing

### Unit Tests
- Parser CSV para cada broker
- Cálculo de promedio ponderado
- Cálculo P&L

### Integration Tests
- Upload CSV → crea investments correctamente
- Vinculación de depósitos
- Endpoints retornan datos correctos

### Manual Testing (User Acceptance)
- Upload real CSV del usuario
- Verificar P&L con cálculo manual
- Chequear sugerencias de depósitos

---

## 10. Notas y Decisiones

- **Costo:** Promedio ponderado (weighted average) — justicia y simplicidad
- **Estructura:** Investments separadas de transacciones personales (Enfoque 1) para mantener claridad
- **Extensibilidad:** Diseño permite evolucionar a Enfoque 2 sin refactor destructivo
- **Brokers:** Inicialmente 3; fácil agregar más clonando template
- **BYMA:** Dato oficial, gratuito, perfecto para Argentina

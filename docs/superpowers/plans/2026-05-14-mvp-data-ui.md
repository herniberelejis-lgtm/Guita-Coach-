# MVP Data + UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar Mercado Pago y Gmail para ingestión automática de transacciones (ingresos + egresos), y construir las 3 pantallas del MVP: Feed de transacciones, Dashboard de franjas, e Insights con límite diario.

**Architecture:** Se agrega `tx_type` ("expense"|"income") al modelo Transaction via auto-migración. El sync de MP busca tanto pagos salientes como cobros entrantes (colecciones). El clasificador existente solo actúa sobre egresos. Las tres pantallas se construyen en el frontend SPA vanilla JS existente.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, Anthropic Claude API, Mercado Pago REST API, Gmail API, Vanilla JS

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `app/models.py` | Modify | Agregar columna `tx_type` |
| `app/database.py` | Modify | Auto-migración SQLite |
| `app/services/mercadopago.py` | Modify | Buscar cobros (income) además de pagos |
| `app/services/gmail.py` | Modify | Detectar emails de ingreso |
| `app/routers/sync.py` | Modify | Persistir tx_type en save |
| `app/routers/budget.py` | Modify | Agregar total_income, total_expenses, balance, pending_count |
| `app/routers/insights.py` | Modify | Agregar daily_allowance, frequent_merchants |
| `app/routers/advisor.py` | Create | Endpoint de análisis de patrones + consejo AI |
| `app/main.py` | Modify | Registrar advisor router |
| `app/services/seed.py` | Modify | Seed con ingresos demo |
| `static/app.js` | Modify | 3 pantallas: feed, franjas, insights |

---

### Task 1: Agregar tx_type al modelo y auto-migración

**Files:**
- Modify: `app/models.py`
- Modify: `app/database.py`
- Test: `tests/test_model_migration.py`

- [ ] **Step 1: Crear test de migración**

```python
# tests/test_model_migration.py
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

def test_tx_type_column_exists_after_migration():
    """tx_type column must exist after init_db runs migrations."""
    from app.database import init_db, engine
    init_db()
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("transactions")]
    assert "tx_type" in cols

def test_tx_type_defaults_to_expense():
    """Existing rows without tx_type get 'expense' default."""
    from app.database import init_db, SessionLocal, engine
    init_db()
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO transactions (source, amount, date, month, category) "
            "VALUES ('manual', 100.0, '2026-05-01', '2026-05', 'gustos')"
        ))
        conn.commit()
        row = conn.execute(text(
            "SELECT tx_type FROM transactions ORDER BY id DESC LIMIT 1"
        )).fetchone()
    assert row[0] == "expense"
```

- [ ] **Step 2: Correr test para verificar que falla**

```
pytest tests/test_model_migration.py -v
```
Expected: FAIL — `tx_type` not in cols

- [ ] **Step 3: Agregar tx_type a models.py**

Abrir `app/models.py` y agregar después de la línea `needs_review`:

```python
    tx_type = Column(String, default="expense")   # "expense" | "income"
```

- [ ] **Step 4: Agregar _run_migrations a database.py**

Abrir `app/database.py` y agregar esta función antes de `init_db`:

```python
from sqlalchemy import text

def _run_migrations():
    """Applies additive SQLite migrations safely (idempotent)."""
    migrations = [
        "ALTER TABLE transactions ADD COLUMN tx_type VARCHAR DEFAULT 'expense'",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                msg = str(e).lower()
                if "duplicate column" not in msg and "already exists" not in msg:
                    raise
```

Luego en `init_db()`, llamar `_run_migrations()` después de `Base.metadata.create_all(engine)`:

```python
def init_db():
    Base.metadata.create_all(engine)
    _run_migrations()
```

- [ ] **Step 5: Correr test para verificar que pasa**

```
pytest tests/test_model_migration.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/models.py app/database.py tests/test_model_migration.py
git commit -m "feat: add tx_type column to Transaction with auto-migration"
```

---

### Task 2: Mercado Pago — detectar ingresos (cobros)

**Files:**
- Modify: `app/services/mercadopago.py`
- Test: `tests/test_mp_income.py`

Contexto: El endpoint actual usa `/v1/payments/search` que solo devuelve pagos SALIENTES. Para ingresos (cobros recibidos) hay que llamar a `/v1/collections/search`. Las transferencias de dinero entre personas (`money_transfer`) sin descripción deben marcarse `needs_review=True`.

- [ ] **Step 1: Escribir tests**

```python
# tests/test_mp_income.py
import pytest
from unittest.mock import patch, MagicMock

FAKE_COLLECTION = {
    "id": "col_001",
    "transaction_amount": 5000.0,
    "currency_id": "ARS",
    "date_approved": "2026-05-10T12:00:00.000-03:00",
    "payment_type_id": "account_money",
    "description": "Pago recibido",
    "payer": {"email": "cliente@mail.com"},
    "status": "approved",
}

FAKE_TRANSFER_NO_DESC = {
    "id": "col_002",
    "transaction_amount": 2000.0,
    "currency_id": "ARS",
    "date_approved": "2026-05-11T09:00:00.000-03:00",
    "payment_type_id": "money_transfer",
    "description": "",
    "payer": {"email": "amigo@mail.com"},
    "status": "approved",
}

def _mock_mp_get(url, *args, **kwargs):
    mock = MagicMock()
    if "collections" in url:
        if "offset=0" in url or "offset" not in url:
            mock.json.return_value = {"results": [FAKE_COLLECTION, FAKE_TRANSFER_NO_DESC], "paging": {"total": 2}}
        else:
            mock.json.return_value = {"results": [], "paging": {"total": 2}}
    else:
        mock.json.return_value = {"results": [], "paging": {"total": 0}}
    return mock

@patch("app.services.mercadopago.httpx.get", side_effect=_mock_mp_get)
def test_collections_returned_as_income(mock_get):
    from app.services.mercadopago import fetch_movements
    import asyncio
    result = asyncio.run(fetch_movements("fake_token"))
    incomes = [t for t in result if t["tx_type"] == "income"]
    assert len(incomes) >= 1
    assert incomes[0]["amount"] == 5000.0

@patch("app.services.mercadopago.httpx.get", side_effect=_mock_mp_get)
def test_money_transfer_no_desc_needs_review(mock_get):
    from app.services.mercadopago import fetch_movements
    import asyncio
    result = asyncio.run(fetch_movements("fake_token"))
    transfers = [t for t in result if t.get("needs_review") is True]
    assert len(transfers) >= 1
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_mp_income.py -v
```
Expected: FAIL — fetch_movements no retorna tx_type ni needs_review

- [ ] **Step 3: Actualizar fetch_movements en mercadopago.py**

Reemplazar la función `fetch_movements` con:

```python
import httpx
from datetime import datetime, timedelta
from typing import List, Dict

async def fetch_movements(access_token: str, days_back: int = 30) -> List[Dict]:
    """Fetches both outgoing payments and incoming collections from Mercado Pago."""
    headers = {"Authorization": f"Bearer {access_token}"}
    since = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00.000-00:00")
    results = []

    # Egresos: pagos realizados
    url_payments = "https://api.mercadopago.com/v1/payments/search"
    offset = 0
    while True:
        resp = httpx.get(url_payments, headers=headers, params={
            "sort": "date_approved", "criteria": "desc",
            "range": "date_approved", "begin_date": since,
            "limit": 50, "offset": offset
        })
        data = resp.json()
        items = data.get("results", [])
        if not items:
            break
        for item in items:
            if item.get("status") != "approved":
                continue
            raw_date = item.get("date_approved", "")[:10]
            results.append({
                "id": f"mp_{item['id']}",
                "source": "mercadopago",
                "tx_type": "expense",
                "amount": float(item.get("transaction_amount", 0)),
                "currency": item.get("currency_id", "ARS"),
                "date": raw_date,
                "month": raw_date[:7],
                "merchant": item.get("description") or item.get("payment_method_id", ""),
                "provider": "MercadoPago",
                "needs_review": False,
                "raw_reference": str(item),
            })
        total = data.get("paging", {}).get("total", 0)
        offset += 50
        if offset >= total:
            break

    # Ingresos: cobros recibidos
    url_collections = "https://api.mercadopago.com/v1/collections/search"
    offset = 0
    while True:
        resp = httpx.get(url_collections, headers=headers, params={
            "sort": "date_approved", "criteria": "desc",
            "range": "date_approved", "begin_date": since,
            "limit": 50, "offset": offset
        })
        data = resp.json()
        items = data.get("results", [])
        if not items:
            break
        for item in items:
            if item.get("status") != "approved":
                continue
            raw_date = item.get("date_approved", "")[:10]
            is_transfer = item.get("payment_type_id") == "money_transfer"
            description = item.get("description", "").strip()
            needs_review = is_transfer and not description
            payer_email = (item.get("payer") or {}).get("email", "")
            merchant = description or payer_email or "Transferencia recibida"
            results.append({
                "id": f"mp_col_{item['id']}",
                "source": "mercadopago",
                "tx_type": "income",
                "amount": float(item.get("transaction_amount", 0)),
                "currency": item.get("currency_id", "ARS"),
                "date": raw_date,
                "month": raw_date[:7],
                "merchant": merchant,
                "provider": "MercadoPago",
                "needs_review": needs_review,
                "raw_reference": str(item),
            })
        total = data.get("paging", {}).get("total", 0)
        offset += 50
        if offset >= total:
            break

    return results
```

- [ ] **Step 4: Correr tests para verificar que pasan**

```
pytest tests/test_mp_income.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/mercadopago.py tests/test_mp_income.py
git commit -m "feat: fetch MP collections as income, flag personal transfers for review"
```

---

### Task 3: Gmail — detectar emails de ingreso

**Files:**
- Modify: `app/services/gmail.py`
- Test: `tests/test_gmail_income.py`

Contexto: El parser actual solo detecta egresos. Hay que agregar patrones regex para emails que indican que el usuario RECIBIO dinero.

- [ ] **Step 1: Escribir tests**

```python
# tests/test_gmail_income.py
import pytest

INCOME_SUBJECTS = [
    "Recibiste $5.000 de Juan Perez",
    "Te acreditaron $12.300 en tu cuenta",
    "Transferencia recibida por $8.750",
    "Deposito recibido: $3.200",
    "Acreditacion de $15.000",
]

EXPENSE_SUBJECTS = [
    "Pagaste $1.500 en Rappi",
    "Tu pago de $3.000 fue procesado",
]

def test_income_subjects_detected():
    from app.services.gmail import _is_income_email
    for subj in INCOME_SUBJECTS:
        assert _is_income_email(subj) is True, f"Should detect income: {subj}"

def test_expense_subjects_not_income():
    from app.services.gmail import _is_income_email
    for subj in EXPENSE_SUBJECTS:
        assert _is_income_email(subj) is False, f"Should NOT detect income: {subj}"

def test_parse_income_amount():
    from app.services.gmail import _parse_amount
    assert _parse_amount("Recibiste $5.000 de Juan") == 5000.0
    assert _parse_amount("Te acreditaron $12.300,50") == 12300.50
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_gmail_income.py -v
```
Expected: FAIL — `_is_income_email` and `_parse_amount` not defined

- [ ] **Step 3: Agregar helpers en gmail.py**

Al inicio de `app/services/gmail.py` agregar (despues de los imports existentes):

```python
import re

_INCOME_PATTERNS = re.compile(
    r"recibiste|te acreditaron|transferencia recibida|deposito recibido|acreditaci[oo]n",
    re.IGNORECASE
)

def _is_income_email(subject_or_body: str) -> bool:
    return bool(_INCOME_PATTERNS.search(subject_or_body))

def _parse_amount(text: str) -> float:
    """Extracts first monetary amount from text. Handles $1.500 and $1.500,50 formats."""
    match = re.search(r'\$\s*([\d\.]+(?:,\d{1,2})?)', text)
    if not match:
        return 0.0
    raw = match.group(1).replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return 0.0

def _extract_sender_name(msg: dict) -> str:
    sender = msg.get("from", "")
    match = re.match(r'^([^<]+)<', sender)
    return match.group(1).strip() if match else sender
```

Luego en la funcion que parsea emails, agregar logica de deteccion:

```python
# Dentro del loop donde se procesa cada email:
subject = msg.get("subject", "")
body = msg.get("body", "")
combined = subject + " " + body

if _is_income_email(combined):
    tx_type = "income"
    amount = _parse_amount(combined)
    merchant = _extract_sender_name(msg) or "Ingreso Gmail"
    category = "ingreso"
    needs_review = False
else:
    tx_type = "expense"
    # logica existente de parseo
```

- [ ] **Step 4: Correr tests**

```
pytest tests/test_gmail_income.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/gmail.py tests/test_gmail_income.py
git commit -m "feat: detect income emails in Gmail parser"
```

---

### Task 4: Sync router — persistir tx_type

**Files:**
- Modify: `app/routers/sync.py`
- Test: `tests/test_sync_tx_type.py`

Contexto: `_save_transactions()` actualmente no guarda `tx_type`. Los ingresos no deben clasificarse (su categoria es "ingreso"). Los egresos pasan por el clasificador.

- [ ] **Step 1: Escribir tests**

```python
# tests/test_sync_tx_type.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()

def test_income_transaction_saved_with_tx_type_income(db):
    from app.routers.sync import _save_transaction_item
    import asyncio
    item = {
        "id": "mp_col_001",
        "source": "mercadopago",
        "tx_type": "income",
        "amount": 10000.0,
        "currency": "ARS",
        "date": "2026-05-10",
        "month": "2026-05",
        "merchant": "Transferencia recibida",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "",
    }
    asyncio.run(_save_transaction_item(item, user_id=1, db=db))
    tx = db.query(Transaction).filter_by(source="mercadopago", tx_type="income").first()
    assert tx is not None
    assert tx.category == "ingreso"
    assert tx.tx_type == "income"

def test_expense_transaction_classified(db):
    from app.routers.sync import _save_transaction_item
    import asyncio
    item = {
        "id": "mp_001",
        "source": "mercadopago",
        "tx_type": "expense",
        "amount": 500.0,
        "currency": "ARS",
        "date": "2026-05-10",
        "month": "2026-05",
        "merchant": "Supermercado Dia",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "",
    }
    asyncio.run(_save_transaction_item(item, user_id=1, db=db))
    tx = db.query(Transaction).filter_by(source="mercadopago", tx_type="expense").first()
    assert tx is not None
    assert tx.tx_type == "expense"
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_sync_tx_type.py -v
```
Expected: FAIL

- [ ] **Step 3: Refactorizar _save_transactions en sync.py**

Agregar funcion `_save_transaction_item` y actualizar el loop:

```python
async def _save_transaction_item(item: dict, user_id: int, db: Session):
    """Saves one transaction item. Classifies expenses, passes income through."""
    existing = db.query(Transaction).filter_by(
        source=item["source"],
        raw_reference=item.get("id", ""),
    ).first()
    if existing:
        return

    tx_type = item.get("tx_type", "expense")

    if tx_type == "income":
        tx = Transaction(
            user_id=user_id,
            source=item["source"],
            tx_type="income",
            amount=item["amount"],
            currency=item.get("currency", "ARS"),
            date=item["date"],
            month=item["month"],
            merchant=item["merchant"],
            provider=item.get("provider", ""),
            category="ingreso",
            subcategory="",
            status="classified",
            confidence=1.0,
            needs_review=item.get("needs_review", False),
            raw_reference=item.get("id", ""),
        )
    else:
        classification = await _classify(item, user_id, db)
        tx = Transaction(
            user_id=user_id,
            source=item["source"],
            tx_type="expense",
            amount=item["amount"],
            currency=item.get("currency", "ARS"),
            date=item["date"],
            month=item["month"],
            merchant=item["merchant"],
            provider=item.get("provider", ""),
            category=classification["category"],
            subcategory=classification.get("subcategory", ""),
            status="classified",
            confidence=classification.get("confidence", 0.0),
            rule_used=classification.get("rule_used"),
            ai_reason=classification.get("ai_reason"),
            needs_review=item.get("needs_review", False) or classification.get("needs_review", False),
            raw_reference=item.get("id", ""),
        )

    db.add(tx)
    db.commit()


async def _save_transactions(items: list, user_id: int, db: Session):
    for item in items:
        await _save_transaction_item(item, user_id, db)
```

- [ ] **Step 4: Correr tests**

```
pytest tests/test_sync_tx_type.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/routers/sync.py tests/test_sync_tx_type.py
git commit -m "feat: persist tx_type in sync, income bypasses classifier"
```

---

### Task 5: Budget endpoint — totales de ingreso/egreso

**Files:**
- Modify: `app/routers/budget.py`
- Test: `tests/test_budget_totals.py`

Contexto: `GET /api/budget/current` actualmente devuelve solo las franjas de gasto. Hay que agregar `total_income`, `total_expenses`, `balance`, y `pending_count`.

- [ ] **Step 1: Escribir tests**

```python
# tests/test_budget_totals.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction, User
from app.main import app
from app.database import get_db

@pytest.fixture
def client_with_data():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    db = TestSession()
    user = User(id=1, monthly_income=100000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    db.add(Transaction(user_id=1, tx_type="income", amount=100000, category="ingreso",
                       date="2026-05-01", month="2026-05", source="mercadopago", merchant="Sueldo"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=20000, category="necesidades",
                       date="2026-05-02", month="2026-05", source="mercadopago", merchant="Supermercado"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=5000, category="gustos",
                       date="2026-05-03", month="2026-05", source="mercadopago", merchant="Netflix",
                       needs_review=True))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_budget_returns_total_income(client_with_data):
    resp = client_with_data.get("/api/budget/current?month=2026-05")
    assert resp.status_code == 200
    assert resp.json()["total_income"] == 100000.0

def test_budget_returns_total_expenses(client_with_data):
    assert client_with_data.get("/api/budget/current?month=2026-05").json()["total_expenses"] == 25000.0

def test_budget_returns_balance(client_with_data):
    assert client_with_data.get("/api/budget/current?month=2026-05").json()["balance"] == 75000.0

def test_budget_returns_pending_count(client_with_data):
    assert client_with_data.get("/api/budget/current?month=2026-05").json()["pending_count"] == 1
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_budget_totals.py -v
```
Expected: FAIL — fields not in response

- [ ] **Step 3: Actualizar budget.py**

```python
@router.get("/current")
async def get_current_budget(month: str = None, db: Session = Depends(get_db)):
    from datetime import date
    if not month:
        month = date.today().strftime("%Y-%m")

    user = db.query(User).filter_by(id=1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    txs = db.query(Transaction).filter(
        Transaction.user_id == 1,
        Transaction.month == month
    ).all()

    income = user.monthly_income or 0
    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }

    spent = {"necesidades": 0.0, "gustos": 0.0, "ahorro": 0.0}
    for t in txs:
        if t.tx_type == "expense" and t.category in spent:
            spent[t.category] += t.amount

    total_income = sum(t.amount for t in txs if t.tx_type == "income")
    total_expenses = sum(t.amount for t in txs if t.tx_type == "expense")
    balance = total_income - total_expenses
    pending_count = sum(1 for t in txs if t.needs_review and t.status != "reviewed")

    from datetime import date as dt
    today = dt.today()
    days_in_month = (dt(today.year, today.month % 12 + 1, 1) - dt(today.year, today.month, 1)).days \
        if today.month < 12 else (dt(today.year + 1, 1, 1) - dt(today.year, today.month, 1)).days
    days_remaining = max(days_in_month - today.day, 1)

    franjas = []
    for cat in ["necesidades", "gustos", "ahorro"]:
        lim = limits[cat]
        s = spent[cat]
        pct = round(s / lim * 100, 1) if lim > 0 else 0
        remaining = max(lim - s, 0)
        daily_allowance = round(remaining / days_remaining, 0)
        franjas.append({
            "category": cat,
            "limit": lim,
            "spent": s,
            "remaining": remaining,
            "pct_used": pct,
            "daily_allowance": daily_allowance,
        })

    return {
        "month": month,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": balance,
        "pending_count": pending_count,
        "franjas": franjas,
    }
```

- [ ] **Step 4: Correr tests**

```
pytest tests/test_budget_totals.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/routers/budget.py tests/test_budget_totals.py
git commit -m "feat: budget endpoint returns income totals, balance and pending count"
```

---

### Task 6: Insights — daily_allowance y comercios frecuentes

**Files:**
- Modify: `app/routers/insights.py`
- Test: `tests/test_insights_daily.py`

- [ ] **Step 1: Escribir tests**

```python
# tests/test_insights_daily.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction, User
from app.main import app
from app.database import get_db

@pytest.fixture
def client_insights():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    db = TestSession()
    user = User(id=1, monthly_income=100000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    for i in range(5):
        db.add(Transaction(user_id=1, tx_type="expense", amount=1000, category="gustos",
                           merchant="Starbucks", date=f"2026-05-0{i+1}", month="2026-05",
                           source="mercadopago"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=8000, category="necesidades",
                       merchant="Carrefour", date="2026-05-06", month="2026-05",
                       source="mercadopago"))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_insights_has_daily_allowance(client_insights):
    resp = client_insights.get("/api/insights/month?month=2026-05")
    assert resp.status_code == 200
    data = resp.json()
    assert "daily_allowance" in data or any("daily_allowance" in str(f) for f in data.get("franjas", []))

def test_insights_has_frequent_merchants(client_insights):
    resp = client_insights.get("/api/insights/month?month=2026-05")
    data = resp.json()
    assert "frequent_merchants" in data
    merchants = data["frequent_merchants"]
    assert any(m["merchant"] == "Starbucks" for m in merchants)
    starbucks = next(m for m in merchants if m["merchant"] == "Starbucks")
    assert starbucks["count"] == 5
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_insights_daily.py -v
```
Expected: FAIL

- [ ] **Step 3: Actualizar insights.py**

```python
from collections import Counter

@router.get("/month")
async def get_month_insights(month: str = None, db: Session = Depends(get_db)):
    from datetime import date
    if not month:
        month = date.today().strftime("%Y-%m")

    user = db.query(User).filter_by(id=1).first()
    txs = db.query(Transaction).filter(
        Transaction.user_id == 1,
        Transaction.month == month,
        Transaction.tx_type == "expense"
    ).all()

    income = user.monthly_income or 0
    today = date.today()
    days_in_month = (date(today.year, today.month % 12 + 1, 1) - date(today.year, today.month, 1)).days \
        if today.month < 12 else (date(today.year + 1, 1, 1) - date(today.year, today.month, 1)).days
    days_remaining = max(days_in_month - today.day, 1)

    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }
    spent = {cat: sum(t.amount for t in txs if t.category == cat) for cat in limits}

    franjas_with_daily = []
    for cat in limits:
        remaining = max(limits[cat] - spent[cat], 0)
        franjas_with_daily.append({
            "category": cat,
            "spent": spent[cat],
            "limit": limits[cat],
            "remaining": remaining,
            "daily_allowance": round(remaining / days_remaining, 0),
        })

    merchant_counts = Counter(t.merchant for t in txs if t.merchant)
    frequent_merchants = [
        {"merchant": m, "count": c, "total": sum(t.amount for t in txs if t.merchant == m)}
        for m, c in merchant_counts.most_common(5)
    ]

    return {
        "month": month,
        "days_remaining": days_remaining,
        "franjas": franjas_with_daily,
        "frequent_merchants": frequent_merchants,
        "daily_allowance": round(max(income - sum(spent.values()), 0) / days_remaining, 0),
    }
```

- [ ] **Step 4: Correr tests**

```
pytest tests/test_insights_daily.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/routers/insights.py tests/test_insights_daily.py
git commit -m "feat: insights endpoint with daily allowance and frequent merchants"
```

---

### Task 7: Advisor router — analisis de patrones y consejo AI

**Files:**
- Create: `app/routers/advisor.py`
- Modify: `app/main.py`
- Test: `tests/test_advisor.py`

- [ ] **Step 1: Escribir tests**

```python
# tests/test_advisor.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction, User
from app.main import app
from app.database import get_db

@pytest.fixture
def client_advisor():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    db = TestSession()
    user = User(id=1, monthly_income=100000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    for i in range(6):
        db.add(Transaction(user_id=1, tx_type="expense", amount=2000, category="gustos",
                           merchant="Rappi", date=f"2026-05-0{i+1}", month="2026-05",
                           source="mercadopago"))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_patterns_endpoint_returns_top_merchants(client_advisor):
    resp = client_advisor.get("/api/advisor/patterns?month=2026-05")
    assert resp.status_code == 200
    data = resp.json()
    assert "top_by_frequency" in data
    assert any(m["merchant"] == "Rappi" for m in data["top_by_frequency"])

def test_advice_endpoint_returns_text(client_advisor):
    resp = client_advisor.post("/api/advisor/advice", json={"month": "2026-05", "focus": "gustos"})
    assert resp.status_code == 200
    data = resp.json()
    assert "advice" in data
    assert len(data["advice"]) > 10
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_advisor.py -v
```
Expected: FAIL — /api/advisor routes not found

- [ ] **Step 3: Crear app/routers/advisor.py**

```python
"""Advisor router: pattern analysis and spending advice."""
from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, User

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


def _get_patterns(db: Session, user_id: int, month: str) -> dict:
    txs = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.month == month,
        Transaction.tx_type == "expense",
    ).all()

    by_freq = Counter(t.merchant for t in txs if t.merchant)
    by_amount: dict = {}
    for t in txs:
        if t.merchant:
            by_amount[t.merchant] = by_amount.get(t.merchant, 0) + t.amount

    top_freq = [
        {"merchant": m, "count": c, "total": by_amount.get(m, 0)}
        for m, c in by_freq.most_common(5)
    ]
    top_amount = [
        {"merchant": m, "total": a, "count": by_freq.get(m, 0)}
        for m, a in sorted(by_amount.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    by_cat: dict = {}
    for t in txs:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.amount

    return {
        "top_by_frequency": top_freq,
        "top_by_amount": top_amount,
        "by_category": by_cat,
    }


@router.get("/patterns")
async def get_patterns(month: str = None, db: Session = Depends(get_db)):
    from datetime import date
    if not month:
        month = date.today().strftime("%Y-%m")
    return _get_patterns(db, user_id=1, month=month)


@router.post("/advice")
async def get_advice(body: dict, db: Session = Depends(get_db)):
    from datetime import date
    month = body.get("month") or date.today().strftime("%Y-%m")
    focus = body.get("focus", "gustos")

    patterns = _get_patterns(db, user_id=1, month=month)
    user = db.query(User).filter_by(id=1).first()
    income = user.monthly_income if user else 0

    from ..config import get_settings
    settings = get_settings()

    if settings.claude_enabled:
        advice = await _claude_advice(patterns, focus, income, settings)
    else:
        advice = _rule_based_advice(patterns, focus, income)

    return {"advice": advice, "month": month, "focus": focus}


def _rule_based_advice(patterns: dict, focus: str, income: float) -> str:
    top = patterns["top_by_frequency"]
    if not top:
        return f"No tenes gastos registrados en {focus} este mes."
    merchant = top[0]["merchant"]
    count = top[0]["count"]
    total = top[0]["total"]
    spent_cat = patterns["by_category"].get(focus, 0)
    limit = income * {"necesidades": 0.5, "gustos": 0.3, "ahorro": 0.2}.get(focus, 0.3)
    pct = int(spent_cat / limit * 100) if limit > 0 else 0
    return (
        f"Tu gasto mas frecuente en {focus} es {merchant} ({count} veces, "
        f"${total:,.0f} en total). Estas al {pct}% del limite de {focus}."
    )


async def _claude_advice(patterns: dict, focus: str, income: float, settings) -> str:
    top_freq = patterns["top_by_frequency"]
    top_lines = "\n".join(
        f"- {m['merchant']}: {m['count']} veces, ${m['total']:,.0f}"
        for m in top_freq[:5]
    )
    spent = patterns["by_category"].get(focus, 0)
    limit = income * {"necesidades": 0.5, "gustos": 0.3, "ahorro": 0.2}.get(focus, 0.3)

    prompt = (
        f"Sos un coach financiero argentino, directo y sin vueltas.\n\n"
        f"El usuario tiene un limite de ${limit:,.0f} en {focus} y lleva gastados ${spent:,.0f}.\n"
        f"Sus gastos mas frecuentes en {focus} este mes:\n{top_lines}\n\n"
        f"Escribi DOS consejos muy concretos (maximo 3 oraciones en total). "
        f"Hace referencia directa a los comercios reales. Tono rioplatense informal. "
        f"No uses emojis. Arranca directo sin saludar."
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return _rule_based_advice(patterns, focus, income)
```

- [ ] **Step 4: Registrar router en main.py**

En `app/main.py` agregar:

```python
from .routers import advisor
app.include_router(advisor.router)
```

- [ ] **Step 5: Correr tests**

```
pytest tests/test_advisor.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/routers/advisor.py app/main.py tests/test_advisor.py
git commit -m "feat: advisor router with pattern analysis and AI spending advice"
```

---

### Task 8: Actualizar seed con ingresos demo

**Files:**
- Modify: `app/services/seed.py`
- Test: `tests/test_seed.py`

- [ ] **Step 1: Escribir test**

```python
# tests/test_seed.py
def test_seed_includes_income_transactions():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models import Base, Transaction
    from app.services.seed import seed_demo_data

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    seed_demo_data(db)

    incomes = db.query(Transaction).filter_by(tx_type="income").all()
    assert len(incomes) >= 1
    assert all(t.category == "ingreso" for t in incomes)
```

- [ ] **Step 2: Correr test para verificar que falla**

```
pytest tests/test_seed.py -v
```

- [ ] **Step 3: Actualizar seed.py**

Al inicio de `seed_demo_data`, agregar antes de los gastos demo:

```python
income_txs = [
    Transaction(
        user_id=1, source="mercadopago", tx_type="income",
        amount=150000.0, currency="ARS",
        date="2026-05-01", month="2026-05",
        merchant="Sueldo Empresa S.A.", provider="MercadoPago",
        category="ingreso", subcategory="sueldo",
        status="classified", confidence=1.0,
        needs_review=False,
        raw_reference="demo_income_001",
    ),
    Transaction(
        user_id=1, source="mercadopago", tx_type="income",
        amount=20000.0, currency="ARS",
        date="2026-05-10", month="2026-05",
        merchant="Transferencia de Juan", provider="MercadoPago",
        category="ingreso", subcategory="transferencia",
        status="classified", confidence=1.0,
        needs_review=True,
        raw_reference="demo_income_002",
    ),
]
for t in income_txs:
    db.add(t)
db.commit()
```

- [ ] **Step 4: Correr test**

```
pytest tests/test_seed.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/seed.py tests/test_seed.py
git commit -m "feat: add income transactions to demo seed data"
```

---

### Task 9: Frontend — Pantalla 1: Summary card con totales

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`
- Modify: `static/style.css` (o el CSS existente)

- [ ] **Step 1: Agregar renderDashboardSummary en app.js**

```javascript
async function renderDashboardSummary(month) {
  const resp = await fetch('/api/budget/current?month=' + month);
  const data = await resp.json();

  const container = document.getElementById('summary-card');
  if (!container) return;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const metrics = [
    { label: 'Ingresos', value: data.total_income, cls: 'income' },
    { label: 'Egresos', value: data.total_expenses, cls: 'expense' },
    { label: 'Balance', value: data.balance, cls: data.balance >= 0 ? 'positive' : 'negative' },
    { label: 'Pendientes', value: data.pending_count, cls: 'pending', isCount: true },
  ];

  metrics.forEach(function(m) {
    var div = document.createElement('div');
    div.className = 'metric-box ' + m.cls;

    var labelEl = document.createElement('span');
    labelEl.className = 'metric-label';
    labelEl.textContent = m.label;

    var valueEl = document.createElement('span');
    valueEl.className = 'metric-value';
    valueEl.textContent = m.isCount
      ? String(m.value)
      : '$' + Number(m.value).toLocaleString('es-AR', { maximumFractionDigits: 0 });

    div.appendChild(labelEl);
    div.appendChild(valueEl);
    container.appendChild(div);
  });

  if (data.pending_count > 0) {
    var badge = document.getElementById('pending-badge');
    if (badge) {
      badge.textContent = String(data.pending_count);
      badge.style.display = 'inline-block';
    }
  }
}
```

- [ ] **Step 2: Agregar HTML del summary card en index.html**

Agregar donde corresponda (antes del listado de transacciones):

```html
<div id="summary-card" class="summary-card"></div>
```

- [ ] **Step 3: Agregar CSS para summary-card**

```css
.summary-card {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.metric-box {
  flex: 1;
  min-width: 140px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface, #1e1e2e);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric-label { font-size: 12px; color: var(--text-muted, #888); text-transform: uppercase; }
.metric-value { font-size: 22px; font-weight: 700; }
.metric-box.income .metric-value { color: #4ade80; }
.metric-box.expense .metric-value { color: #f87171; }
.metric-box.positive .metric-value { color: #4ade80; }
.metric-box.negative .metric-value { color: #f87171; }
.metric-box.pending .metric-value { color: #fbbf24; }
```

- [ ] **Step 4: Llamar renderDashboardSummary en init**

```javascript
// En DOMContentLoaded o funcion de carga:
var currentMonth = new Date().toISOString().slice(0, 7);
renderDashboardSummary(currentMonth);
```

- [ ] **Step 5: Verificar en navegador**

Correr `python run.py`. La card de resumen debe mostrar 4 valores.

- [ ] **Step 6: Commit**

```bash
git add static/app.js static/index.html static/style.css
git commit -m "feat: dashboard summary card with income, expenses, balance, pending count"
```

---

### Task 10: Frontend — Tab Pendientes con modal de categorizacion

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`

- [ ] **Step 1: Agregar renderPendingTab en app.js**

```javascript
async function renderPendingTab() {
  var resp = await fetch('/api/transactions/needs-review');
  var items = await resp.json();

  var container = document.getElementById('pending-list');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  if (items.length === 0) {
    var p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Todo al dia, no hay transacciones para revisar.';
    container.appendChild(p);
    return;
  }

  items.forEach(function(tx) {
    var row = document.createElement('div');
    row.className = 'tx-row pending';

    var info = document.createElement('div');
    info.className = 'tx-info';

    var merchant = document.createElement('span');
    merchant.className = 'tx-merchant';
    merchant.textContent = tx.merchant || 'Sin descripcion';

    var dateEl = document.createElement('span');
    dateEl.className = 'tx-date';
    dateEl.textContent = tx.date;

    var amount = document.createElement('span');
    amount.className = 'tx-amount';
    amount.textContent = '$' + Number(tx.amount).toLocaleString('es-AR', { maximumFractionDigits: 0 });

    var btn = document.createElement('button');
    btn.className = 'btn-categorize';
    btn.textContent = 'Categorizar';
    btn.addEventListener('click', function() { openCategorizeModal(tx); });

    info.appendChild(merchant);
    info.appendChild(dateEl);
    row.appendChild(info);
    row.appendChild(amount);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

function openCategorizeModal(tx) {
  var modal = document.getElementById('categorize-modal');
  if (!modal) return;

  var title = modal.querySelector('#modal-merchant');
  if (title) title.textContent = tx.merchant || 'Sin descripcion';

  var amountEl = modal.querySelector('#modal-amount');
  if (amountEl) amountEl.textContent = '$' + Number(tx.amount).toLocaleString('es-AR');

  modal.querySelectorAll('.category-btn').forEach(function(btn) {
    btn.onclick = async function() {
      var cat = btn.dataset.category;
      await fetch('/api/transactions/' + tx.id + '/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat }),
      });
      modal.style.display = 'none';
      await renderPendingTab();
      var badge = document.getElementById('pending-badge');
      if (badge) {
        var remaining = parseInt(badge.textContent || '0') - 1;
        badge.textContent = remaining > 0 ? String(remaining) : '';
        badge.style.display = remaining > 0 ? 'inline-block' : 'none';
      }
    };
  });

  modal.style.display = 'flex';
}
```

- [ ] **Step 2: Agregar HTML del modal y contenedor en index.html**

Agregar antes de cerrar body:

```html
<div id="categorize-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); align-items:center; justify-content:center; z-index:1000;">
  <div style="background:#1e1e2e; border-radius:16px; padding:32px; max-width:400px; width:90%;">
    <h3 style="margin:0 0 8px">Categorizar transaccion</h3>
    <p id="modal-merchant" style="font-weight:600; margin:0 0 4px"></p>
    <p id="modal-amount" style="color:#888; margin:0 0 24px"></p>
    <div style="display:flex; gap:12px; flex-wrap:wrap;">
      <button class="category-btn" data-category="necesidades" style="flex:1; padding:14px; border-radius:10px; border:none; background:#3b82f6; color:#fff; cursor:pointer; font-size:15px;">Necesidades</button>
      <button class="category-btn" data-category="gustos" style="flex:1; padding:14px; border-radius:10px; border:none; background:#8b5cf6; color:#fff; cursor:pointer; font-size:15px;">Gustos</button>
      <button class="category-btn" data-category="ahorro" style="flex:1; padding:14px; border-radius:10px; border:none; background:#10b981; color:#fff; cursor:pointer; font-size:15px;">Ahorro</button>
    </div>
    <button onclick="document.getElementById('categorize-modal').style.display='none'" style="margin-top:16px; background:none; border:1px solid #444; color:#888; padding:8px 20px; border-radius:8px; cursor:pointer;">Cancelar</button>
  </div>
</div>
<div id="pending-list" class="tx-list"></div>
```

- [ ] **Step 3: Conectar tab de pendientes**

```javascript
var tabPending = document.getElementById('tab-pending');
if (tabPending) {
  tabPending.addEventListener('click', function() {
    renderPendingTab();
  });
}
```

- [ ] **Step 4: Verificar en navegador**

Verificar que el modal se abre, se puede elegir categoria y la transaccion desaparece.

- [ ] **Step 5: Commit**

```bash
git add static/app.js static/index.html
git commit -m "feat: pending transactions tab with categorization modal"
```

---

### Task 11: Frontend — Pantalla Insights con franjas y limite diario

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`
- Modify: `static/style.css`

- [ ] **Step 1: Agregar renderInsightsScreen en app.js**

```javascript
async function renderInsightsScreen(month) {
  var budgetResp = await fetch('/api/budget/current?month=' + month);
  var insightsResp = await fetch('/api/insights/month?month=' + month);
  var budget = await budgetResp.json();
  var insights = await insightsResp.json();

  var container = document.getElementById('insights-container');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  var COLORS = { necesidades: '#3b82f6', gustos: '#8b5cf6', ahorro: '#10b981' };
  var LABELS = { necesidades: 'Necesidades', gustos: 'Gustos', ahorro: 'Ahorro' };

  (budget.franjas || []).forEach(function(franja) {
    var card = document.createElement('div');
    card.className = 'franja-card';

    var header = document.createElement('div');
    header.className = 'franja-header';

    var catLabel = document.createElement('span');
    catLabel.className = 'franja-name';
    catLabel.textContent = LABELS[franja.category] || franja.category;

    var pctLabel = document.createElement('span');
    pctLabel.className = 'franja-pct';
    pctLabel.textContent = franja.pct_used + '%';

    header.appendChild(catLabel);
    header.appendChild(pctLabel);

    var bar = document.createElement('div');
    bar.className = 'franja-bar-bg';
    var fill = document.createElement('div');
    fill.className = 'franja-bar-fill';
    fill.style.width = Math.min(franja.pct_used, 100) + '%';
    fill.style.background = COLORS[franja.category] || '#888';
    bar.appendChild(fill);

    var stats = document.createElement('div');
    stats.className = 'franja-stats';

    var spent = document.createElement('span');
    spent.textContent = 'Gastado: $' + Number(franja.spent).toLocaleString('es-AR', { maximumFractionDigits: 0 });

    var remaining = document.createElement('span');
    remaining.textContent = 'Resta: $' + Number(franja.remaining).toLocaleString('es-AR', { maximumFractionDigits: 0 });

    var daily = document.createElement('span');
    daily.className = 'daily-allowance';
    daily.textContent = 'Podes gastar $' + Number(franja.daily_allowance).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + '/dia';

    stats.appendChild(spent);
    stats.appendChild(remaining);
    stats.appendChild(daily);

    var adviceBtn = document.createElement('button');
    adviceBtn.className = 'btn-advice';
    adviceBtn.textContent = 'Pedir consejo';

    var adviceText = document.createElement('p');
    adviceText.className = 'advice-text';
    adviceText.style.display = 'none';

    adviceBtn.addEventListener('click', async function() {
      adviceBtn.textContent = 'Cargando...';
      adviceBtn.disabled = true;
      try {
        var r = await fetch('/api/advisor/advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: month, focus: franja.category }),
        });
        var d = await r.json();
        adviceText.textContent = d.advice;
        adviceText.style.display = 'block';
      } finally {
        adviceBtn.textContent = 'Pedir consejo';
        adviceBtn.disabled = false;
      }
    });

    card.appendChild(header);
    card.appendChild(bar);
    card.appendChild(stats);
    card.appendChild(adviceBtn);
    card.appendChild(adviceText);
    container.appendChild(card);
  });

  if (insights.frequent_merchants && insights.frequent_merchants.length > 0) {
    var section = document.createElement('div');
    section.className = 'frequent-section';

    var title = document.createElement('h3');
    title.textContent = 'Tus habitos este mes';
    section.appendChild(title);

    insights.frequent_merchants.forEach(function(m) {
      var row = document.createElement('div');
      row.className = 'frequent-row';

      var name = document.createElement('span');
      name.textContent = m.merchant;

      var detail = document.createElement('span');
      detail.className = 'frequent-detail';
      detail.textContent = m.count + ' veces · $' + Number(m.total).toLocaleString('es-AR', { maximumFractionDigits: 0 });

      row.appendChild(name);
      row.appendChild(detail);
      section.appendChild(row);
    });

    container.appendChild(section);
  }
}
```

- [ ] **Step 2: Agregar CSS para franjas**

```css
.franja-card { background: var(--surface, #1e1e2e); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.franja-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
.franja-name { font-weight: 600; font-size: 16px; }
.franja-pct { color: #888; font-size: 14px; }
.franja-bar-bg { background: rgba(255,255,255,0.08); border-radius: 99px; height: 8px; margin-bottom: 12px; overflow: hidden; }
.franja-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
.franja-stats { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #aaa; margin-bottom: 12px; }
.daily-allowance { color: #4ade80; font-weight: 600; }
.btn-advice { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #ccc; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.btn-advice:hover { background: rgba(255,255,255,0.1); }
.advice-text { margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 14px; line-height: 1.5; color: #ddd; }
.frequent-section { margin-top: 24px; }
.frequent-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.frequent-detail { color: #888; font-size: 13px; }
```

- [ ] **Step 3: Agregar contenedor en index.html y conectar tab**

Agregar en index.html:
```html
<div id="insights-container"></div>
```

Conectar tab en app.js:
```javascript
var tabInsights = document.getElementById('tab-insights');
if (tabInsights) {
  tabInsights.addEventListener('click', function() {
    var month = new Date().toISOString().slice(0, 7);
    renderInsightsScreen(month);
  });
}
```

- [ ] **Step 4: Verificar en navegador**

Verificar que las 3 franjas muestran barra + daily allowance + boton consejo funcional.

- [ ] **Step 5: Commit**

```bash
git add static/app.js static/index.html static/style.css
git commit -m "feat: insights screen with franja bars, daily allowance, and advisor advice"
```

---

## Verificacion final

```bash
pytest tests/ -v
python run.py
# Abrir http://localhost:8000
```

Checklist:
- [ ] `tx_type` existe en BD y se auto-migra
- [ ] Sync de MP trae cobros como income
- [ ] Gmail detecta emails de ingreso
- [ ] Budget endpoint devuelve total_income, total_expenses, balance, pending_count
- [ ] Insights devuelve daily_allowance y frequent_merchants
- [ ] Advisor devuelve consejo (rule-based si no hay Claude key)
- [ ] Pantalla 1: card con 4 metricas visible
- [ ] Pantalla 1: tab pendientes con modal de categorizacion
- [ ] Pantalla 2: franjas con barra, saldo diario, boton consejo

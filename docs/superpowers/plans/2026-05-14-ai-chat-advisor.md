# AI Chat Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un chat con asesor financiero IA que guia al usuario a traves de las 3 prioridades de ahorro: cancelar deudas de alta tasa, construir fondo de emergencia de 6 meses, e invertir de forma diversificada.

**Architecture:** Nuevo router `/api/chat` que recibe mensajes y devuelve respuestas. El asesor carga contexto financiero real (ingresos, egresos, ahorro acumulado) desde la BD y usa Claude con un system prompt especializado. Si Claude no esta disponible, responde con logica de reglas basada en el contexto financiero. El chat se muestra como una pantalla separada en el SPA frontend existente.

**Tech Stack:** FastAPI, Anthropic Claude API, SQLite/SQLAlchemy, Vanilla JS

---

## File Map

| Archivo | Accion | Responsabilidad |
|---|---|---|
| `app/routers/chat.py` | Create | Endpoint POST /api/chat + GET /api/chat/starters |
| `app/main.py` | Modify | Registrar chat router |
| `static/app.js` | Modify | Chat UI: burbuja de mensaje, input, render respuesta |
| `static/index.html` | Modify | Pantalla del chat con sidebar de navegacion |
| `static/style.css` | Modify | Estilos del chat |

---

### Task 1: Chat endpoint con contexto financiero y Claude

**Files:**
- Create: `app/routers/chat.py`
- Modify: `app/main.py`
- Test: `tests/test_chat.py`

- [ ] **Step 1: Escribir tests**

```python
# tests/test_chat.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction, User
from app.main import app
from app.database import get_db

@pytest.fixture
def client_chat():
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
    user = User(id=1, monthly_income=150000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    # Ingresos del mes
    db.add(Transaction(user_id=1, tx_type="income", amount=150000, category="ingreso",
                       date="2026-05-01", month="2026-05", source="mercadopago", merchant="Sueldo"))
    # Gastos del mes
    db.add(Transaction(user_id=1, tx_type="expense", amount=40000, category="necesidades",
                       date="2026-05-05", month="2026-05", source="mercadopago", merchant="Alquiler"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=15000, category="gustos",
                       date="2026-05-06", month="2026-05", source="mercadopago", merchant="Restaurantes"))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_chat_returns_reply(client_chat):
    resp = client_chat.post("/api/chat", json={
        "message": "Cuanto dinero tengo disponible este mes?",
        "history": []
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert len(data["reply"]) > 5

def test_chat_reply_is_string(client_chat):
    resp = client_chat.post("/api/chat", json={
        "message": "Que deberia hacer con mis ahorros?",
        "history": [
            {"role": "user", "content": "Hola"},
            {"role": "assistant", "content": "Hola, en que te ayudo?"}
        ]
    })
    assert isinstance(resp.json()["reply"], str)

def test_chat_starters_returns_list(client_chat):
    resp = client_chat.get("/api/chat/starters")
    assert resp.status_code == 200
    data = resp.json()
    assert "starters" in data
    assert len(data["starters"]) >= 3
    assert all(isinstance(s, str) for s in data["starters"])
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```
pytest tests/test_chat.py -v
```
Expected: FAIL — /api/chat not found

- [ ] **Step 3: Crear app/routers/chat.py**

```python
"""Chat router: AI financial advisor with Argentine investment priority framework."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, User

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_PROMPT = """Sos un asesor financiero personal argentino, directo, empático y sin vueltas.

Tu marco de trabajo tiene TRES prioridades estrictas en este orden:
1. CANCELAR DEUDAS DE ALTA TASA: Tarjetas de credito, prestamos personales, financieras (cualquier deuda arriba del 5% mensual va primero siempre).
2. FONDO DE EMERGENCIA: Construir un colchon equivalente a 6 meses de gastos totales, en instrumentos liquidos (caja de ahorro, FCI money market).
3. INVERSION DIVERSIFICADA: Solo cuando los pasos 1 y 2 esten cubiertos. Instrumentos: cedears para exposicion al dolar/acciones globales, bonos soberanos CER para cobertura inflacion, FCI diversificados. Nunca mas del 30% en un solo instrumento.

Reglas de comunicacion:
- Tono rioplatense informal pero profesional (vos, che, dale, etc.)
- Respuestas cortas y concretas (maximo 4 oraciones por respuesta)
- Siempre hace referencia a los numeros reales del usuario cuando los tenes
- Si el usuario pregunta por cripto o activos especulativos: podés mencionarlos brevemente pero recorda que primero van las 3 prioridades
- No uses emojis
- Arranca directo al punto, sin saludar

Contexto financiero del usuario (se actualiza en cada mensaje):
{context}
"""

STARTERS = [
    "Cuanto me sobra a fin de mes para ahorrar o invertir?",
    "Tengo deudas, por donde empiezo?",
    "Ya tengo fondo de emergencia, en que invierto?",
    "Cuanto necesito para armar mi fondo de emergencia?",
    "Como diversifico mis ahorros en Argentina?",
]


def _load_financial_context(db: Session) -> dict:
    """Loads current month income, expenses, and savings from the DB."""
    from datetime import date
    month = date.today().strftime("%Y-%m")

    user = db.query(User).filter_by(id=1).first()
    txs = db.query(Transaction).filter(
        Transaction.user_id == 1,
        Transaction.month == month,
    ).all()

    income = sum(t.amount for t in txs if t.tx_type == "income")
    expenses = sum(t.amount for t in txs if t.tx_type == "expense")
    savings_accumulated = sum(t.amount for t in txs if t.category == "ahorro")

    monthly_income_config = user.monthly_income if user else 0
    necesidades_limit = monthly_income_config * (user.necesidades_pct / 100) if user else 0
    gustos_limit = monthly_income_config * (user.gustos_pct / 100) if user else 0
    ahorro_limit = monthly_income_config * (user.ahorro_pct / 100) if user else 0

    monthly_expenses_baseline = expenses  # gastos reales del mes

    return {
        "month": month,
        "income_this_month": income,
        "expenses_this_month": expenses,
        "balance_this_month": income - expenses,
        "savings_accumulated_this_month": savings_accumulated,
        "monthly_income_configured": monthly_income_config,
        "limits": {
            "necesidades": necesidades_limit,
            "gustos": gustos_limit,
            "ahorro": ahorro_limit,
        },
        "emergency_fund_target": monthly_expenses_baseline * 6,
    }


def _format_context(ctx: dict) -> str:
    return (
        f"Mes actual: {ctx['month']}\n"
        f"Ingresos del mes: ${ctx['income_this_month']:,.0f}\n"
        f"Gastos del mes: ${ctx['expenses_this_month']:,.0f}\n"
        f"Balance disponible: ${ctx['balance_this_month']:,.0f}\n"
        f"Ingreso mensual configurado: ${ctx['monthly_income_configured']:,.0f}\n"
        f"Limite necesidades: ${ctx['limits']['necesidades']:,.0f}\n"
        f"Limite gustos: ${ctx['limits']['gustos']:,.0f}\n"
        f"Meta ahorro mensual: ${ctx['limits']['ahorro']:,.0f}\n"
        f"Ahorro acumulado este mes: ${ctx['savings_accumulated_this_month']:,.0f}\n"
        f"Meta fondo de emergencia (6 meses de gastos): ${ctx['emergency_fund_target']:,.0f}"
    )


def _rule_based_reply(message: str, ctx: dict) -> str:
    """Fallback reply when Claude is not available."""
    msg_lower = message.lower()
    balance = ctx["balance_this_month"]
    income = ctx["income_this_month"]
    ahorro_limit = ctx["limits"]["ahorro"]
    emergency_target = ctx["emergency_fund_target"]

    if any(word in msg_lower for word in ["deuda", "prestamo", "tarjeta", "credito"]):
        return (
            f"Primero que nada, las deudas de alta tasa (tarjetas, prestamos) siempre van antes "
            f"que cualquier inversion. Mientras tenes deuda al 5%+ mensual, cualquier rendimiento "
            f"de inversion queda por debajo. Pagalas primero, dale."
        )
    if any(word in msg_lower for word in ["emergencia", "colchon", "reserva"]):
        return (
            f"Tu meta de fondo de emergencia es ${emergency_target:,.0f} (6 meses de gastos). "
            f"Una vez canceladas las deudas, dedica el ahorro mensual (${ahorro_limit:,.0f}) "
            f"a un FCI money market o caja de ahorro hasta llegar a esa cifra."
        )
    if any(word in msg_lower for word in ["invert", "cedear", "bono", "fci", "plazo fijo"]):
        return (
            f"Para invertir en Argentina: cedears para exposicion al dolar y acciones globales, "
            f"bonos CER para cubrirte de la inflacion, FCI diversificados para liquidez. "
            f"Nunca pongas mas del 30% en un solo instrumento."
        )
    if balance > 0:
        return (
            f"Este mes te sobran ${balance:,.0f} despues de gastos. "
            f"Primero asegurate de no tener deudas de alta tasa, despues construi tu fondo de emergencia "
            f"(meta: ${emergency_target:,.0f}), y solo entonces empeza a invertir."
        )
    return (
        f"Tus gastos este mes (${ctx['expenses_this_month']:,.0f}) superaron tus ingresos "
        f"(${income:,.0f}). Antes de pensar en inversiones, revisemos donde recortar."
    )


@router.post("")
async def chat(body: dict, db: Session = Depends(get_db)):
    message = body.get("message", "").strip()
    history = body.get("history", [])

    if not message:
        return {"reply": "Mandame tu consulta y te ayudo."}

    ctx = _load_financial_context(db)

    from ..config import get_settings
    settings = get_settings()

    if settings.claude_enabled:
        reply = await _claude_reply(message, history, ctx, settings)
    else:
        reply = _rule_based_reply(message, ctx)

    return {"reply": reply}


@router.get("/starters")
async def get_starters():
    return {"starters": STARTERS}


async def _claude_reply(message: str, history: list, ctx: dict, settings) -> str:
    system = SYSTEM_PROMPT.format(context=_format_context(ctx))

    messages = []
    for turn in history[-10:]:  # max 10 turnos de contexto
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=400,
            system=system,
            messages=messages,
        )
        return resp.content[0].text.strip()
    except Exception:
        return _rule_based_reply(message, ctx)
```

- [ ] **Step 4: Registrar chat router en main.py**

En `app/main.py` agregar:

```python
from .routers import chat
app.include_router(chat.router)
```

- [ ] **Step 5: Correr tests**

```
pytest tests/test_chat.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/routers/chat.py app/main.py tests/test_chat.py
git commit -m "feat: chat router with AI advisor and Argentine investment priority framework"
```

---

### Task 2: Frontend — Chat UI

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`
- Modify: `static/style.css`

La pantalla de chat es una ventana de mensajes con input en el fondo. El historial se mantiene en memoria durante la sesion. Al cargar la pantalla se muestran los starters como burbujas clickeables.

- [ ] **Step 1: Agregar estado y funciones del chat en app.js**

```javascript
// Estado del chat (en memoria de sesion)
var chatHistory = [];

async function initChatScreen() {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  // Cargar starters
  var resp = await fetch('/api/chat/starters');
  var data = await resp.json();

  while (container.firstChild) container.removeChild(container.firstChild);
  chatHistory = [];

  var intro = document.createElement('div');
  intro.className = 'chat-intro';
  intro.textContent = 'Hola! Soy tu asesor financiero. En que te ayudo hoy?';
  container.appendChild(intro);

  var startersDiv = document.createElement('div');
  startersDiv.className = 'chat-starters';

  (data.starters || []).forEach(function(s) {
    var btn = document.createElement('button');
    btn.className = 'starter-btn';
    btn.textContent = s;
    btn.addEventListener('click', function() {
      startersDiv.style.display = 'none';
      sendChatMessage(s);
    });
    startersDiv.appendChild(btn);
  });

  container.appendChild(startersDiv);
}

function appendChatBubble(role, text) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + role;

  var content = document.createElement('p');
  content.textContent = text;

  bubble.appendChild(content);
  container.appendChild(bubble);

  // Scroll al fondo
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage(text) {
  if (!text || !text.trim()) return;

  var input = document.getElementById('chat-input');
  if (input) input.value = '';

  appendChatBubble('user', text);
  chatHistory.push({ role: 'user', content: text });

  // Indicador de escritura
  var typing = document.createElement('div');
  typing.className = 'chat-bubble assistant typing';
  typing.id = 'typing-indicator';
  var dot = document.createElement('span');
  dot.textContent = '...';
  typing.appendChild(dot);
  var container = document.getElementById('chat-messages');
  if (container) {
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  try {
    var resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(0, -1) }),
    });
    var data = await resp.json();
    var reply = data.reply || 'No pude procesar tu consulta.';

    var indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.parentNode.removeChild(indicator);

    appendChatBubble('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (e) {
    var indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.parentNode.removeChild(indicator);
    appendChatBubble('assistant', 'Hubo un error de conexion. Intenta de nuevo.');
  }
}

function setupChatInput() {
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send-btn');

  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      var val = input ? input.value.trim() : '';
      if (val) sendChatMessage(val);
    });
  }

  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var val = input.value.trim();
        if (val) sendChatMessage(val);
      }
    });
  }
}
```

- [ ] **Step 2: Agregar HTML de la pantalla de chat en index.html**

Agregar como pantalla oculta (con `display:none` o clase `hidden`):

```html
<!-- Pantalla Chat Asesor -->
<div id="screen-chat" class="screen" style="display:none; flex-direction:column; height:100%;">
  <div class="screen-header">
    <h2>Asesor Financiero</h2>
    <p class="screen-subtitle">Prioridades: deudas → fondo emergencia → inversion</p>
  </div>
  <div id="chat-messages" class="chat-messages"></div>
  <div class="chat-input-area">
    <input id="chat-input" type="text" placeholder="Escribi tu consulta..." class="chat-input" autocomplete="off" />
    <button id="chat-send-btn" class="chat-send-btn">Enviar</button>
  </div>
</div>
```

- [ ] **Step 3: Agregar CSS del chat**

```css
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chat-intro {
  text-align: center;
  color: #888;
  font-size: 14px;
  padding: 16px 0 8px;
}
.chat-starters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.starter-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: #ccc;
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  transition: background 0.2s;
}
.starter-btn:hover { background: rgba(255,255,255,0.1); }
.chat-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
}
.chat-bubble p { margin: 0; }
.chat-bubble.user {
  align-self: flex-end;
  background: #3b82f6;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-bubble.assistant {
  align-self: flex-start;
  background: var(--surface, #1e1e2e);
  color: #e0e0e0;
  border-bottom-left-radius: 4px;
}
.chat-bubble.typing { opacity: 0.6; }
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.chat-input {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  color: #fff;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}
.chat-input:focus { border-color: #3b82f6; }
.chat-send-btn {
  background: #3b82f6;
  border: none;
  color: #fff;
  padding: 12px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.chat-send-btn:hover { background: #2563eb; }
```

- [ ] **Step 4: Correr tests de chat para confirmar que aun pasan**

```
pytest tests/test_chat.py -v
```
Expected: PASS (sin cambios en backend)

- [ ] **Step 5: Commit**

```bash
git add static/app.js static/index.html static/style.css
git commit -m "feat: chat UI with starter prompts, message bubbles, typing indicator"
```

---

### Task 3: Integracion — Navegacion al chat desde sidebar

**Files:**
- Modify: `static/app.js`
- Modify: `static/index.html`

El objetivo es poder navegar entre las 3 pantallas (feed, insights, chat) desde la barra de navegacion existente.

- [ ] **Step 1: Verificar estructura de navegacion en index.html**

Abrir `static/index.html` y buscar la navegacion existente (probablemente un `<nav>` o tabs). Identificar como se implementa el cambio de pantalla actualmente (buscar `display:none`, clases `active`, o similar).

- [ ] **Step 2: Agregar item de navegacion "Asesor" en index.html**

En la navegacion existente, agregar (siguiendo el patron existente):

```html
<button id="nav-chat" class="nav-item" data-screen="chat">
  Asesor
</button>
```

O si usa iconos SVG, seguir el estilo existente de los otros items.

- [ ] **Step 3: Conectar navegacion en app.js**

```javascript
function showScreen(screenName) {
  // Ocultar todas las pantallas
  document.querySelectorAll('.screen').forEach(function(s) {
    s.style.display = 'none';
  });

  // Mostrar la pantalla seleccionada
  var target = document.getElementById('screen-' + screenName);
  if (target) target.style.display = 'flex';

  // Actualizar estado activo en navegacion
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.classList.remove('active');
  });
  var activeNav = document.getElementById('nav-' + screenName);
  if (activeNav) activeNav.classList.add('active');

  // Inicializar la pantalla
  var month = new Date().toISOString().slice(0, 7);
  if (screenName === 'chat') {
    initChatScreen();
    setupChatInput();
  } else if (screenName === 'insights') {
    renderInsightsScreen(month);
  } else if (screenName === 'feed') {
    renderDashboardSummary(month);
  }
}

// Conectar botones de navegacion
document.querySelectorAll('.nav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var screen = btn.dataset.screen;
    if (screen) showScreen(screen);
  });
});

// Pantalla inicial
showScreen('feed');
```

Nota: Si el codebase ya tiene su propio sistema de navegacion, adaptar `showScreen` a ese sistema en lugar de reemplazarlo.

- [ ] **Step 4: Asegurarse que todas las pantallas tienen clase `screen`**

Verificar que en index.html todos los contenedores de pantalla tienen `class="screen"`:
- `id="screen-feed"` para el feed de transacciones
- `id="screen-insights"` para las franjas
- `id="screen-chat"` para el chat asesor

Si los IDs existentes son distintos, adaptar el `showScreen` al naming existente.

- [ ] **Step 5: Test de integracion en navegador**

Correr `python run.py`. Verificar:

1. La pantalla inicial (feed) carga con la summary card
2. El boton "Asesor" navega a la pantalla de chat
3. Los starters aparecen y son clickeables
4. Escribir un mensaje y presionar Enter envia el mensaje
5. La respuesta aparece como burbuja del asesor
6. Volver a otra pantalla y regresar al chat muestra un chat limpio

- [ ] **Step 6: Correr todos los tests**

```
pytest tests/ -v
```
Expected: todos PASS

- [ ] **Step 7: Commit final**

```bash
git add static/app.js static/index.html
git commit -m "feat: chat screen navigation integration, showScreen router"
```

---

## Verificacion final del Plan B

```bash
pytest tests/test_chat.py -v
python run.py
# Abrir http://localhost:8000
```

Checklist:
- [ ] POST /api/chat responde con reply string (con o sin Claude key)
- [ ] GET /api/chat/starters devuelve 5 preguntas
- [ ] El contexto financiero real (ingresos/egresos del mes) se incluye en el prompt
- [ ] Sin CLAUDE_API_KEY: responde con logica de reglas sobre deudas/emergencia/inversion
- [ ] Con CLAUDE_API_KEY: responde en tono rioplatense con datos reales del usuario
- [ ] UI: starters clickeables en pantalla limpia
- [ ] UI: burbujas diferenciadas usuario vs asesor
- [ ] UI: indicador de "..." mientras espera respuesta
- [ ] UI: Enter envia el mensaje
- [ ] Navegacion: boton "Asesor" en sidebar lleva a la pantalla de chat

# Gemini AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un provider de IA abstracto que use Gemini (gratis, MVP) o Claude (producción) según una variable de entorno, sin tocar los servicios de negocio al hacer el switch.

**Architecture:** Un único archivo `app/services/ai_provider.py` expone tres funciones (`classify`, `get_advice`, `chat`) que internamente delegan a Gemini o Claude según `AI_PROVIDER` en `.env`. Los servicios existentes (`classifier.py`, `advisor.py`, `chat.py`) dejan de llamar directamente al SDK de Anthropic y pasan a usar estas funciones.

**Tech Stack:** `google-generativeai>=0.8.0`, `anthropic==0.40.0` (ya instalado), FastAPI, Python 3.x

---

### Task 1: Agregar dependencia y variables de entorno

**Files:**
- Modify: `requirements.txt`
- Modify: `.env`
- Modify: `app/config.py`

- [ ] **Step 1: Agregar google-generativeai a requirements.txt**

Agregar al final de `requirements.txt`:
```
google-generativeai>=0.8.0
```

- [ ] **Step 2: Instalar la dependencia**

```bash
pip install google-generativeai
```
Expected: instalación exitosa sin errores.

- [ ] **Step 3: Agregar variables al .env**

Agregar al final de `.env`:
```
GEMINI_API_KEY=
AI_PROVIDER=gemini
```

- [ ] **Step 4: Actualizar config.py**

Reemplazar el contenido completo de `app/config.py`:
```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    claude_api_key: str = ""
    gemini_api_key: str = ""
    ai_provider: str = "gemini"
    google_client_id: str = ""
    google_client_secret: str = ""
    mp_client_id: str = ""
    mp_client_secret: str = ""
    app_url: str = "http://localhost:8000"
    port: int = 8000
    demo_mode: bool = True

    @property
    def claude_enabled(self) -> bool:
        return bool(self.claude_api_key)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def gmail_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def mp_enabled(self) -> bool:
        return bool(self.mp_client_id and self.mp_client_secret)

    @property
    def ai_enabled(self) -> bool:
        if self.ai_provider == "claude":
            return self.claude_enabled
        return self.gemini_enabled

    model_config = {"env_file": ".env", "case_sensitive": False}

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Commit**

```bash
git add requirements.txt .env app/config.py
git commit -m "feat: add Gemini dependency and AI_PROVIDER config"
```

---

### Task 2: Crear app/services/ai_provider.py

**Files:**
- Create: `app/services/ai_provider.py`

- [ ] **Step 1: Crear el archivo**

Crear `app/services/ai_provider.py` con el siguiente contenido:

```python
"""
Proveedor de IA abstracto. Selecciona Gemini o Claude según AI_PROVIDER en .env.
Expone: classify(), get_advice(), chat()
"""
import json
from typing import Optional

SYSTEM_PROMPT_CHAT = """Sos un asesor financiero personal argentino, directo, empatico y sin vueltas.

Tu marco de trabajo tiene TRES prioridades estrictas en este orden:
1. CANCELAR DEUDAS DE ALTA TASA: Tarjetas de credito, prestamos personales, financieras (cualquier deuda arriba del 5% mensual va primero siempre).
2. FONDO DE EMERGENCIA: Construir un colchon equivalente a 6 meses de gastos totales, en instrumentos liquidos (caja de ahorro, FCI money market).
3. INVERSION DIVERSIFICADA: Solo cuando los pasos 1 y 2 esten cubiertos. Instrumentos: cedears para exposicion al dolar/acciones globales, bonos soberanos CER para cobertura inflacion, FCI diversificados. Nunca mas del 30% en un solo instrumento.

Reglas de comunicacion:
- Tono rioplatense informal pero profesional (vos, che, dale, etc.)
- Respuestas cortas y concretas (maximo 4 oraciones por respuesta)
- Siempre hace referencia a los numeros reales del usuario cuando los tenes
- No uses emojis
- Arranca directo al punto, sin saludar

Contexto financiero del usuario:
{context}
"""


def _get_settings():
    from ..config import get_settings
    return get_settings()


# ── Classify ────────────────────────────────────────────────────────────────

def _classify_prompt(merchant: str, amount: float, source: str) -> str:
    return f"""Clasificá este gasto de un usuario argentino en una de las tres franjas.

Comercio: {merchant}
Monto: ${amount:,.0f} ARS
Fuente: {source}

Franjas:
- necesidades: gastos esenciales (alquiler, supermercado, servicios, transporte, salud)
- gustos: gastos discrecionales (delivery, restaurantes, ropa, entretenimiento, suscripciones)
- ahorro: separación de plata para ahorro

Referencias argentinas:
SUBE=Transporte/necesidades, Rappi/PedidosYa=Delivery/gustos, Coto/DÍA/Carrefour=Supermercado/necesidades,
Spotify/Netflix=Streaming/gustos, EDENOR/METROGAS/AYSA=Servicios/necesidades, Zara/ropa=Compras/gustos

Respondé SOLO con JSON válido, sin texto adicional:
{{
  "category": "necesidades" | "gustos" | "ahorro",
  "subcategory": "string",
  "confidence": 0.0-1.0,
  "reason": "explicación corta en español rioplatense"
}}"""


async def classify(merchant: str, amount: float, source: str) -> dict:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _classify_claude(merchant, amount, source, settings)
        elif settings.gemini_enabled:
            return await _classify_gemini(merchant, amount, source, settings)
    except Exception as e:
        pass
    return {"category": None, "subcategory": None, "confidence": 0.0,
            "rule_used": "error", "ai_reason": "IA no disponible"}


async def _classify_gemini(merchant: str, amount: float, source: str, settings) -> dict:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")
    response = model.generate_content(_classify_prompt(merchant, amount, source))
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text)
    return {
        "category": data.get("category"),
        "subcategory": data.get("subcategory"),
        "confidence": float(data.get("confidence", 0.8)),
        "rule_used": "gemini",
        "ai_reason": data.get("reason", ""),
    }


async def _classify_claude(merchant: str, amount: float, source: str, settings) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.claude_api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": _classify_prompt(merchant, amount, source)}],
    )
    data = json.loads(msg.content[0].text)
    return {
        "category": data.get("category"),
        "subcategory": data.get("subcategory"),
        "confidence": float(data.get("confidence", 0.8)),
        "rule_used": "claude",
        "ai_reason": data.get("reason", ""),
    }


# ── Advice ──────────────────────────────────────────────────────────────────

def _advice_prompt(patterns: dict, focus: str, income: float) -> str:
    top_freq = patterns.get("top_by_frequency", [])
    top_lines = "\n".join(
        f"- {m['merchant']}: {m['count']} veces, ${m['total']:,.0f}"
        for m in top_freq[:5]
    )
    spent = patterns.get("by_category", {}).get(focus, 0)
    limit = income * {"necesidades": 0.5, "gustos": 0.3, "ahorro": 0.2}.get(focus, 0.3)
    return (
        f"Sos un coach financiero argentino, directo y sin vueltas.\n\n"
        f"El usuario tiene un limite de ${limit:,.0f} en {focus} y lleva gastados ${spent:,.0f}.\n"
        f"Sus gastos mas frecuentes en {focus} este mes:\n{top_lines}\n\n"
        f"Escribi DOS consejos muy concretos (maximo 3 oraciones en total). "
        f"Hace referencia directa a los comercios reales. Tono rioplatense informal. "
        f"No uses emojis. Arranca directo sin saludar."
    )


async def get_advice(patterns: dict, focus: str, income: float) -> Optional[str]:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _advice_claude(patterns, focus, income, settings)
        elif settings.gemini_enabled:
            return await _advice_gemini(patterns, focus, income, settings)
    except Exception:
        pass
    return None


async def _advice_gemini(patterns: dict, focus: str, income: float, settings) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")
    response = model.generate_content(_advice_prompt(patterns, focus, income))
    return response.text.strip()


async def _advice_claude(patterns: dict, focus: str, income: float, settings) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.claude_api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": _advice_prompt(patterns, focus, income)}],
    )
    return msg.content[0].text.strip()


# ── Chat ────────────────────────────────────────────────────────────────────

async def chat(message: str, history: list, financial_context: str) -> Optional[str]:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _chat_claude(message, history, financial_context, settings)
        elif settings.gemini_enabled:
            return await _chat_gemini(message, history, financial_context, settings)
    except Exception:
        pass
    return None


async def _chat_gemini(message: str, history: list, financial_context: str, settings) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    system = SYSTEM_PROMPT_CHAT.format(context=financial_context)
    model = genai.GenerativeModel("gemini-2.0-flash-lite", system_instruction=system)

    gemini_history = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role == "user" and content:
            gemini_history.append({"role": "user", "parts": [content]})
        elif role == "assistant" and content:
            gemini_history.append({"role": "model", "parts": [content]})

    chat_session = model.start_chat(history=gemini_history)
    response = chat_session.send_message(message)
    return response.text.strip()


async def _chat_claude(message: str, history: list, financial_context: str, settings) -> str:
    import anthropic
    system = SYSTEM_PROMPT_CHAT.format(context=financial_context)
    messages = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})
    client = anthropic.Anthropic(api_key=settings.claude_api_key)
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=system,
        messages=messages,
    )
    return resp.content[0].text.strip()
```

- [ ] **Step 2: Commit**

```bash
git add app/services/ai_provider.py
git commit -m "feat: add abstract AI provider with Gemini and Claude support"
```

---

### Task 3: Actualizar classifier.py

**Files:**
- Modify: `app/services/classifier.py`

- [ ] **Step 1: Reemplazar classify_with_claude por ai_provider**

Reemplazar la función `classify_with_claude` y la función `classify` con:

```python
async def classify(merchant: str, amount: float, source: str, db: Session) -> dict:
    result = classify_by_rules(merchant, db)
    if result and result["confidence"] >= 0.85:
        return result

    from . import ai_provider
    ai_result = await ai_provider.classify(merchant, amount, source)
    if ai_result.get("confidence", 0) >= 0.85:
        return ai_result

    if result:
        return result

    return (ai_result or {}) | {"needs_review": True}
```

Y eliminar la función `classify_with_claude` completa (líneas 71-120 del archivo original).

- [ ] **Step 2: Commit**

```bash
git add app/services/classifier.py
git commit -m "refactor: classifier uses ai_provider instead of direct Claude calls"
```

---

### Task 4: Actualizar advisor.py

**Files:**
- Modify: `app/routers/advisor.py`

- [ ] **Step 1: Reemplazar _claude_advice por ai_provider**

En `app/routers/advisor.py`, reemplazar el bloque del endpoint `get_advice`:

```python
@router.post("/advice")
async def get_advice(body: dict, db: Session = Depends(get_db)):
    from datetime import date
    month = body.get("month") or date.today().strftime("%Y-%m")
    focus = body.get("focus", "gustos")

    patterns = _get_patterns(db, user_id=1, month=month)
    user = db.query(User).filter_by(id=1).first()
    income = user.monthly_income if user else 0

    from ..services import ai_provider
    advice = await ai_provider.get_advice(patterns, focus, income)
    if not advice:
        advice = _rule_based_advice(patterns, focus, income)

    return {"advice": advice, "month": month, "focus": focus}
```

Y eliminar la función `_claude_advice` completa (líneas 88-116 del archivo original).

- [ ] **Step 2: Eliminar import de get_settings que ya no se usa en advisor.py**

Quitar la línea:
```python
from ..config import get_settings
```
del interior del endpoint (ya no se necesita).

- [ ] **Step 3: Commit**

```bash
git add app/routers/advisor.py
git commit -m "refactor: advisor uses ai_provider instead of direct Claude calls"
```

---

### Task 5: Actualizar chat.py

**Files:**
- Modify: `app/routers/chat.py`

- [ ] **Step 1: Simplificar chat.py**

Reemplazar el endpoint `chat` y eliminar `_claude_reply` y `SYSTEM_PROMPT` (que ahora viven en `ai_provider.py`):

```python
@router.post("")
async def chat(body: dict, db: Session = Depends(get_db)):
    message = body.get("message", "").strip()
    history = body.get("history", [])

    if not message:
        return {"reply": "Mandame tu consulta y te ayudo."}

    ctx = _load_financial_context(db)

    from ..services import ai_provider
    reply = await ai_provider.chat(message, history, _format_context(ctx))
    if not reply:
        reply = _rule_based_reply(message, ctx)

    return {"reply": reply}
```

Y eliminar:
- La constante `SYSTEM_PROMPT` (líneas 9-26)
- La función `_claude_reply` completa (líneas 150-172)
- El import de `get_settings` dentro del endpoint

- [ ] **Step 2: Commit**

```bash
git add app/routers/chat.py
git commit -m "refactor: chat uses ai_provider instead of direct Claude calls"
```

---

### Task 6: Obtener GEMINI_API_KEY y probar

**Files:**
- Modify: `.env`

- [ ] **Step 1: Obtener la API key gratuita**

1. Ir a https://aistudio.google.com
2. Iniciar sesión con tu cuenta de Google
3. Clic en "Get API key" → "Create API key"
4. Copiar la key

- [ ] **Step 2: Agregar al .env**

```
GEMINI_API_KEY=AIzaSy...tu_key_aqui
AI_PROVIDER=gemini
```

- [ ] **Step 3: Reiniciar el servidor**

```bash
# Ctrl+C para detener
python run.py
```

- [ ] **Step 4: Verificar que funciona**

- Abrir la app → sección **Asesor** → pedir un consejo → debe responder con texto generado por Gemini (no la respuesta genérica de reglas)
- Abrir sección **Chat** → enviar mensaje → debe responder en tono rioplatense con datos reales

- [ ] **Step 5: Para el futuro — switch a Claude en producción**

Cuando quieran usar Claude, solo cambiar en `.env`:
```
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...
```
Sin tocar ningún archivo de código.

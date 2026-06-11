# Gemini AI Provider — Design Spec

## Objetivo
Integrar Gemini (gratuito) como proveedor de IA para MVP, con arquitectura que permita cambiar a Claude en producción con una sola variable de entorno.

## Arquitectura

### Nuevo archivo: `app/services/ai_provider.py`
Provider abstracto que expone tres funciones:
- `classify(merchant, amount, source)` → `{category, subcategory, confidence, reason}`
- `get_advice(patterns, focus, income)` → `str`
- `chat(message, history, financial_context)` → `str`

Selecciona el modelo según `AI_PROVIDER` en `.env`:
- `gemini` → usa `google-generativeai` con `gemini-2.0-flash-lite` (gratuito)
- `claude` → usa `anthropic` SDK con `claude-sonnet-4-6`
- fallback → reglas sin IA si no hay API key configurada

### Cambios en config.py
Agregar:
- `gemini_api_key: str = ""`
- `ai_provider: str = "gemini"`
- `@property gemini_enabled`

### Cambios en .env
```
GEMINI_API_KEY=...    # desde aistudio.google.com
AI_PROVIDER=gemini
```

### Cambios en servicios existentes
- `classifier.py`: reemplaza llamada directa a Claude por `ai_provider.classify()`
- `advisor.py`: reemplaza `_claude_advice()` por `ai_provider.get_advice()`
- `chat.py`: reemplaza `_claude_reply()` por `ai_provider.chat()`

### requirements.txt
Agregar `google-generativeai>=0.8.0`

## Switch a producción
```
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...
```
Sin tocar ningún archivo de código.

## Manejo de errores
Si la API falla → fallback silencioso a reglas básicas (comportamiento actual).

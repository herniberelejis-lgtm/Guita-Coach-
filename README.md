# Guita Coach 🌿

Asesor financiero personal para Argentina. Se conecta a Mercado Pago y Gmail,
centraliza tus ingresos y gastos, filtra transferencias entre tus propias
cuentas y duplicados, y te asesora con IA sobre tus hábitos reales de gasto.

## Features

- 💸 **Sincronización automática** con Mercado Pago (OAuth) y comprobantes de Gmail
- 🧹 **Datos limpios**: detección de transferencias entre cuentas propias y gastos duplicados entre fuentes
- 📊 **Dashboard visual**: presupuesto 50/30/20, desglose por categoría, histórico de 6 meses
- 🤖 **Asesor IA** (Gemini): analiza tus patrones de gasto y responde con tus números reales
- 🎯 **Metas de ahorro** con submetas, gastos fijos y compras en cuotas
- 💵 **Dólar blue/oficial** en tiempo real
- 📱 **PWA instalable**: funciona como app en el teléfono, con modo offline
- 🔔 Alertas al acercarte a los límites de presupuesto
- 🎨 3 temas: Zen (default), Neo-Fintech y Clásico

## Stack

Python · FastAPI · SQLAlchemy · SQLite · Vanilla JS · PWA

## Correr local

```bash
git clone https://github.com/TU_USUARIO/guita-coach.git
cd guita-coach
python run.py
```

Abre http://localhost:8000. La primera vez crea `.env` desde `.env.example` —
completá tus claves ahí (Gemini, Google OAuth, Mercado Pago). Sin claves, la
app funciona igual con carga manual y asesor en modo reglas.

## Deploy

Ver [docs/deploy.md](docs/deploy.md). El repo incluye `Procfile` listo para
Railway/Render.

## Tests

```bash
python -m pytest tests
```

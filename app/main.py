"""FastAPI entry point — monta routers y sirve el frontend estático."""
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

from .database import init_db
from .routers import auth, budget, transactions, insights, sync, advisor, chat, goals, investments, investments_extra, academy

# Sin esto, uvicorn solo configura sus propios loggers y los INFO de la app
# (entre ellos los redirect_uri de OAuth) nunca llegan a los logs del deploy.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Guita Coach", version="0.2.0", docs_url="/api/docs")
# Sin build step (JS/CSS sin minificar ni bundlear): comprimir en runtime es
# la ganancia de performance más barata disponible — reduce ~70-80% el peso
# de texto (JS/CSS/JSON) en cada request.
app.add_middleware(GZipMiddleware, minimum_size=500)

# ─── DB init on startup ───────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    from .config import get_settings
    from .database import SessionLocal
    from .models import Transaction
    settings = get_settings()

    if settings.demo_mode:
        logger.warning(
            "DEMO_MODE está activo: cualquier request sin sesión se autentica como el usuario 1 "
            "sin credenciales. Nunca dejar esto activo en un deploy con datos reales."
        )
    if settings.secret_key_is_default:
        logger.warning(
            "SECRET_KEY sigue en su valor por defecto — usado para cifrar tokens OAuth en reposo. "
            "Generá uno propio (python -c \"import secrets; print(secrets.token_hex(32))\") y "
            "seteá SECRET_KEY antes de manejar datos reales."
        )

    # Los redirect_uri salen todos de APP_URL. Cuando no coinciden con lo
    # registrado en Google/Mercado Pago el error es redirect_uri_mismatch, que
    # no dice cuál es la URI que se mandó — dejarlas en el log de arranque
    # convierte ese diagnóstico en mirar una línea.
    if settings.gmail_enabled or settings.mp_enabled:
        logger.info("APP_URL = %s", settings.app_url)
        logger.info("Redirect URIs que esta instancia va a usar (deben estar registradas):")
        if settings.gmail_enabled:
            logger.info("  Google (login)  %s/api/auth/google/login/callback", settings.app_url)
            logger.info("  Gmail (conexión) %s/api/auth/gmail/callback", settings.app_url)
        if settings.mp_enabled:
            logger.info("  MP (login)      %s/api/auth/mp/login/callback", settings.app_url)
            logger.info("  MP (conexión)   %s/api/auth/mp/callback", settings.app_url)
        if settings.app_url.startswith("http://localhost"):
            logger.warning(
                "APP_URL sigue en el default (localhost): en un deploy real todos los "
                "flujos de OAuth van a fallar con redirect_uri_mismatch."
            )

    if settings.demo_mode:
        from .services.seed import seed_demo_data
        db = SessionLocal()
        try:
            if db.query(Transaction).count() == 0:
                seed_demo_data(db)
        finally:
            db.close()

# ─── API routers ─────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(budget.router)
app.include_router(transactions.router)
app.include_router(insights.router)
app.include_router(sync.router)
app.include_router(advisor.router)
app.include_router(chat.router)
app.include_router(goals.router)
app.include_router(investments.router)
app.include_router(investments_extra.router)
app.include_router(academy.router)

# ─── Static frontend ─────────────────────────────────────────────────────────
static_path = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")

@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    return FileResponse(os.path.join(static_path, "sw.js"),
                        media_type="application/javascript",
                        headers={"Service-Worker-Allowed": "/"})

@app.get("/privacidad", include_in_schema=False)
@app.get("/privacy", include_in_schema=False)
async def privacy_policy():
    """Política de privacidad — ruta explícita antes del catch-all SPA."""
    page = os.path.join(static_path, "privacidad.html")
    content = open(page, encoding="utf-8").read()
    return HTMLResponse(content=content, headers={"Cache-Control": "no-store"})

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    index = os.path.join(static_path, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"status": "Guita Coach API", "docs": "/api/docs"}

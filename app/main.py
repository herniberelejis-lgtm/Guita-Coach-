"""FastAPI entry point — monta routers y sirve el frontend estático."""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .database import init_db
from .routers import auth, budget, transactions, insights, sync, advisor, chat

app = FastAPI(title="Guita Coach", version="0.1.0", docs_url="/api/docs")

# ─── DB init on startup ───────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    from .config import get_settings
    from .database import SessionLocal
    from .models import Transaction
    if get_settings().demo_mode:
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

# ─── Static frontend ─────────────────────────────────────────────────────────
static_path = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")

@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    index = os.path.join(static_path, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"status": "Guita Coach API", "docs": "/api/docs"}

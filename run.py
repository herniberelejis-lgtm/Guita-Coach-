"""
Guita Coach — punto de entrada único.
Correr con: python run.py
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

def check_env():
    env_file = Path(".env")
    if not env_file.exists():
        print("⚙  Creando .env desde .env.example...")
        shutil.copy(".env.example", ".env")
        print("✓  .env creado. Podés agregar tus API keys cuando las tengas.")

def check_deps():
    try:
        import fastapi, uvicorn, sqlalchemy, anthropic
    except ImportError:
        print("📦 Instalando dependencias...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"])
        print("✓  Dependencias instaladas.")

def init_db():
    from app.database import init_db
    init_db()

def seed_demo():
    from app.database import SessionLocal
    from app.models import Transaction
    db = SessionLocal()
    try:
        if db.query(Transaction).count() == 0:
            from app.services.seed import seed_demo_data
            seed_demo_data(db)
            print("✓  Datos demo cargados.")
    finally:
        db.close()

if __name__ == "__main__":
    print("\n🎯 Guita Coach — arrancando...\n")
    check_env()
    check_deps()

    # Importar después de verificar deps
    from dotenv import load_dotenv
    load_dotenv()

    init_db()
    seed_demo()

    port = int(os.getenv("PORT", 8000))
    print(f"\n✅ Abrí: http://localhost:{port}\n")

    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)

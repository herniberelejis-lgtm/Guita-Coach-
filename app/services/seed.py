"""Carga datos demo de Hernán para el mes en curso."""
from datetime import datetime, date
from ..models import Transaction, Alert, CategoryRule

def seed_demo_data(db):
    now = date.today()
    month = now.strftime("%Y-%m")
    year, mon = now.year, now.month

    txs = [
        {"merchant": "Ahorro automático", "amount": 260000, "category": "ahorro",
         "subcategory": "Ahorro mensual", "source": "demo", "date": f"{year}-{mon:02d}-01"},
        {"merchant": "Alquiler", "amount": 325000, "category": "necesidades",
         "subcategory": "Vivienda", "source": "demo", "date": f"{year}-{mon:02d}-01"},
        {"merchant": "Supermercado Coto", "amount": 58000, "category": "necesidades",
         "subcategory": "Supermercado", "source": "demo", "date": f"{year}-{mon:02d}-04"},
        {"merchant": "SUBE – recarga", "amount": 24500, "category": "necesidades",
         "subcategory": "Transporte", "source": "demo", "date": f"{year}-{mon:02d}-07"},
        {"merchant": "Netflix + Spotify", "amount": 32500, "category": "gustos",
         "subcategory": "Streaming", "source": "demo", "date": f"{year}-{mon:02d}-09"},
        {"merchant": "Lo de Marcos – Restaurante", "amount": 50000, "category": "gustos",
         "subcategory": "Restaurantes", "source": "demo", "date": f"{year}-{mon:02d}-10"},
        {"merchant": "Farmacia del Pueblo", "amount": 15200, "category": "necesidades",
         "subcategory": "Salud", "source": "demo", "date": f"{year}-{mon:02d}-12"},
        {"merchant": "Gas + Luz", "amount": 70800, "category": "necesidades",
         "subcategory": "Servicios", "source": "demo", "date": f"{year}-{mon:02d}-14"},
        {"merchant": "Zara", "amount": 88000, "category": "gustos",
         "subcategory": "Compras", "source": "demo", "date": f"{year}-{mon:02d}-15"},
        {"merchant": "Supermercado DÍA", "amount": 58000, "category": "necesidades",
         "subcategory": "Supermercado", "source": "demo", "date": f"{year}-{mon:02d}-16"},
        {"merchant": "Rappi", "amount": 62000, "category": "gustos",
         "subcategory": "Delivery", "source": "demo", "date": f"{year}-{mon:02d}-17"},
        {"merchant": "Peluquería Cristal", "amount": 25300, "category": "gustos",
         "subcategory": "Personal", "source": "demo", "date": f"{year}-{mon:02d}-18"},
        {"merchant": "Cantina del Centro", "amount": 21400, "category": "gustos",
         "subcategory": "Restaurantes", "source": "demo", "date": f"{year}-{mon:02d}-18"},
    ]

    for t in txs:
        db.add(Transaction(
            user_id=1,
            provider="Demo",
            currency="ARS",
            month=month,
            status="classified",
            confidence=1.0,
            rule_used="demo",
            **t
        ))

    # Reglas de categoría
    rules = [
        ("rappi", "gustos", "Delivery"),
        ("pedidosya", "gustos", "Delivery"),
        ("spotify", "gustos", "Streaming"),
        ("netflix", "gustos", "Streaming"),
        ("sube", "necesidades", "Transporte"),
        ("farmacia", "necesidades", "Salud"),
        ("coto", "necesidades", "Supermercado"),
        ("dia", "necesidades", "Supermercado"),
        ("carrefour", "necesidades", "Supermercado"),
        ("zara", "gustos", "Compras"),
        ("alquiler", "necesidades", "Vivienda"),
        ("ahorro", "ahorro", "Ahorro mensual"),
    ]
    for pattern, cat, subcat in rules:
        db.add(CategoryRule(user_id=1, pattern=pattern, category=cat, subcategory=subcat, priority=1))

    db.commit()

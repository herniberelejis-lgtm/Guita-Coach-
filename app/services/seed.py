"""Carga datos demo de Hernán para el mes en curso."""
from datetime import datetime, date
from ..models import Transaction, Alert, CategoryRule

def seed_demo_data(db):
    now = date.today()
    month = now.strftime("%Y-%m")
    year, mon = now.year, now.month

    income_txs = [
        Transaction(
            user_id=1, source="mercadopago", tx_type="income",
            amount=1300000.0, currency="ARS",
            date=f"{year}-{mon:02d}-01", month=month,
            merchant="Sueldo Empresa S.A.", provider="MercadoPago",
            category="ingreso", subcategory="sueldo",
            status="classified", confidence=1.0,
            needs_review=False,
            raw_reference="demo_income_001",
        ),
        Transaction(
            user_id=1, source="mercadopago", tx_type="income",
            amount=50000.0, currency="ARS",
            date=f"{year}-{mon:02d}-10", month=month,
            merchant="Freelance Juan", provider="MercadoPago",
            category="ingreso", subcategory="transferencia",
            status="classified", confidence=1.0,
            needs_review=True,
            raw_reference="demo_income_002",
        ),
    ]
    for t in income_txs:
        db.add(t)
    db.commit()

    txs = [
        {"merchant": "Ahorro automático", "amount": 260000, "category": "ahorro",
         "subcategory": "Ahorro mensual", "source": "demo", "date": f"{year}-{mon:02d}-01", "tx_type": "expense"},
        {"merchant": "Alquiler", "amount": 325000, "category": "necesidades",
         "subcategory": "Vivienda", "source": "demo", "date": f"{year}-{mon:02d}-01", "tx_type": "expense"},
        {"merchant": "Supermercado Coto", "amount": 58000, "category": "necesidades",
         "subcategory": "Supermercado", "source": "demo", "date": f"{year}-{mon:02d}-04", "tx_type": "expense"},
        {"merchant": "SUBE – recarga", "amount": 24500, "category": "necesidades",
         "subcategory": "Transporte", "source": "demo", "date": f"{year}-{mon:02d}-07", "tx_type": "expense"},
        {"merchant": "Netflix + Spotify", "amount": 32500, "category": "gustos",
         "subcategory": "Streaming", "source": "demo", "date": f"{year}-{mon:02d}-09", "tx_type": "expense"},
        {"merchant": "Lo de Marcos – Restaurante", "amount": 50000, "category": "gustos",
         "subcategory": "Restaurantes", "source": "demo", "date": f"{year}-{mon:02d}-10", "tx_type": "expense"},
        {"merchant": "Farmacia del Pueblo", "amount": 15200, "category": "necesidades",
         "subcategory": "Salud", "source": "demo", "date": f"{year}-{mon:02d}-12", "tx_type": "expense"},
        {"merchant": "Gas + Luz", "amount": 70800, "category": "necesidades",
         "subcategory": "Servicios", "source": "demo", "date": f"{year}-{mon:02d}-14", "tx_type": "expense"},
        {"merchant": "Zara", "amount": 88000, "category": "gustos",
         "subcategory": "Compras", "source": "demo", "date": f"{year}-{mon:02d}-15", "tx_type": "expense"},
        {"merchant": "Supermercado DÍA", "amount": 58000, "category": "necesidades",
         "subcategory": "Supermercado", "source": "demo", "date": f"{year}-{mon:02d}-16", "tx_type": "expense"},
        {"merchant": "Rappi", "amount": 62000, "category": "gustos",
         "subcategory": "Delivery", "source": "demo", "date": f"{year}-{mon:02d}-17", "tx_type": "expense"},
        {"merchant": "Peluquería Cristal", "amount": 25300, "category": "gustos",
         "subcategory": "Personal", "source": "demo", "date": f"{year}-{mon:02d}-18", "tx_type": "expense"},
        {"merchant": "Cantina del Centro", "amount": 21400, "category": "gustos",
         "subcategory": "Restaurantes", "source": "demo", "date": f"{year}-{mon:02d}-18", "tx_type": "expense"},
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

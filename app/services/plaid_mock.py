"""Mock de Plaid para testing local sin credenciales reales"""
from datetime import datetime, timedelta
import random
from typing import List, Dict

class PlaidMockClient:
    """Cliente mock de Plaid con datos simulados realistas"""

    def __init__(self):
        self.tokens = {}  # Guardar públicos y access tokens para testing
        self.user_accounts = {}  # Simular cuentas por usuario
        self.user_transactions = {}  # Simular transacciones por usuario

    async def create_link_token(self, user_id: int, user_email: str) -> str:
        """Generar token mock para conectar"""
        token = f"link_test_{user_id}_{datetime.now().timestamp()}"
        self.tokens[token] = {"user_id": user_id, "email": user_email}
        return token

    async def exchange_token(self, public_token: str) -> str:
        """Intercambiar public token por access token mock"""
        if not public_token.startswith("public_"):
            # Token válido de testing
            return f"access_test_{public_token}_{datetime.now().timestamp()}"
        return f"access_mock_{datetime.now().timestamp()}"

    async def get_accounts(self, access_token: str) -> List[Dict]:
        """Retornar cuentas simuladas de bancos argentinos"""
        return [
            {
                "account_id": "acc_checking_001",
                "name": "Cuenta Corriente",
                "type": "depository",
                "subtype": "checking",
                "mask": "4682",
                "official_name": "Cuenta Corriente en Pesos",
                "balance": 45230.50,
                "currency": "ARS",
                "institution": "Platypus Bank"
            },
            {
                "account_id": "acc_savings_001",
                "name": "Caja de Ahorro",
                "type": "depository",
                "subtype": "savings",
                "mask": "7891",
                "official_name": "Caja de Ahorro en Pesos",
                "balance": 128500.75,
                "currency": "ARS",
                "institution": "Platypus Bank"
            },
            {
                "account_id": "acc_credit_001",
                "name": "Tarjeta de Crédito",
                "type": "credit",
                "subtype": "credit card",
                "mask": "5432",
                "official_name": "Visa Platypus",
                "balance": -2340.00,
                "currency": "ARS",
                "institution": "Platypus Bank"
            }
        ]

    async def get_transactions(self, access_token: str, days: int = 30) -> List[Dict]:
        """Retornar transacciones simuladas realistas"""
        merchants = [
            {"name": "Supermercado Carrefour", "category": "FOOD_AND_DRINK", "amount": 3450.00},
            {"name": "Farmacia del Dr. Surtidor", "category": "HEALTHCARE", "amount": 890.50},
            {"name": "Pago Netflix", "category": "ENTERTAINMENT", "amount": 299.99},
            {"name": "Spotify Premium", "category": "ENTERTAINMENT", "amount": 199.99},
            {"name": "Librería El Ateneo", "category": "SHOPPING", "amount": 1230.00},
            {"name": "Uber Eats", "category": "FOOD_AND_DRINK", "amount": 645.00},
            {"name": "YPF Estación Servicio", "category": "TRANSPORTATION", "amount": 2500.00},
            {"name": "Edesur - Factura", "category": "UTILITIES", "amount": 1850.00},
            {"name": "Movistar - Teléfono", "category": "UTILITIES", "amount": 899.99},
            {"name": "Aerolíneas Argentinas", "category": "TRANSPORTATION", "amount": 8900.00},
            {"name": "Gym Smart Fit", "category": "FITNESS", "amount": 599.99},
            {"name": "Amazon.com.ar", "category": "SHOPPING", "amount": 4230.00},
            {"name": "Rappi Delivery", "category": "FOOD_AND_DRINK", "amount": 320.50},
            {"name": "Cine Hoyts", "category": "ENTERTAINMENT", "amount": 890.00},
            {"name": "Barbería Premium", "category": "PERSONAL_CARE", "amount": 450.00},
            {"name": "Transferencia Salario", "category": "INCOME", "amount": -35000.00},
            {"name": "Depósito Freelance", "category": "INCOME", "amount": -8500.00},
        ]

        transactions = []
        now = datetime.now()

        for i in range(25):  # 25 transacciones en los últimos 30 días
            days_ago = random.randint(0, days)
            tx_date = (now - timedelta(days=days_ago)).date()
            merchant = random.choice(merchants)

            amount = merchant["amount"]
            tx_id = f"txn_mock_{i}_{tx_date.isoformat()}"

            transactions.append({
                "transaction_id": tx_id,
                "account_id": "acc_checking_001",
                "amount": amount,
                "date": tx_date.isoformat(),
                "name": merchant["name"],
                "merchant_name": merchant["name"],
                "personal_finance_category": {
                    "primary": merchant["category"],
                    "detailed": merchant["category"]
                },
                "pending": False,
                "iso_currency_code": "ARS",
                "unofficial_currency_code": "ARS"
            })

        # Ordenar por fecha descendente
        transactions.sort(key=lambda x: x["date"], reverse=True)
        return transactions

# Instancia global del mock
plaid_mock_client = PlaidMockClient()

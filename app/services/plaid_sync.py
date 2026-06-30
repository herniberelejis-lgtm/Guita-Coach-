import os
import httpx
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from fastapi import HTTPException

# Importar mock para testing
from .plaid_mock import plaid_mock_client

class PlaidClient:
    """Cliente HTTP para Plaid API - con mock para testing"""

    def __init__(self):
        self.client_id = os.getenv('PLAID_CLIENT_ID', '')
        self.secret = os.getenv('PLAID_SECRET', '')
        self.env = os.getenv('PLAID_ENV', 'sandbox')
        self.country = os.getenv('PLAID_COUNTRY_CODES', 'AR')

        # Detectar si son credenciales de TEST para usar mock
        self.use_mock = (self.client_id or '').startswith('test_') or (self.secret or '').startswith('test_')

        # URLs de Plaid
        self.url_base = 'https://sandbox.plaid.com' if self.env == 'sandbox' else 'https://production.plaid.com'

        if not self.client_id or not self.secret:
            raise ValueError("PLAID_CLIENT_ID y PLAID_SECRET requeridos en .env")

    async def create_link_token(self, user_id: int, user_email: str) -> Optional[str]:
        """Generar token para que usuario enlace su cuenta bancaria"""
        if self.use_mock:
            return await plaid_mock_client.create_link_token(user_id, user_email)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.url_base}/link/token/create',
                    json={
                        'client_id': self.client_id,
                        'secret': self.secret,
                        'user': {
                            'client_user_id': str(user_id)
                        },
                        'client_name': 'Guita Coach',
                        'user_email_address': user_email,
                        'country_codes': [self.country],
                        'language': 'es',
                        'products': ['auth', 'transactions'],
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get('link_token')
                else:
                    print(f"Error Plaid: {response.status_code} - {response.text}")
                    return None
        except Exception as e:
            print(f"Error creando link token: {e}")
            return None

    async def exchange_token(self, public_token: str) -> Optional[str]:
        """Intercambiar public token por access token"""
        if self.use_mock:
            return await plaid_mock_client.exchange_token(public_token)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.url_base}/item/public_token/exchange',
                    json={
                        'client_id': self.client_id,
                        'secret': self.secret,
                        'public_token': public_token,
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get('access_token')
                else:
                    print(f"Error intercambiando token: {response.status_code} - {response.text}")
                    return None
        except Exception as e:
            print(f"Error en exchange_token: {e}")
            return None

    async def get_transactions(self, access_token: str, days: int = 30) -> List[Dict]:
        """Obtener transacciones de los últimos N días"""
        if self.use_mock:
            return await plaid_mock_client.get_transactions(access_token, days)

        try:
            start_date = (datetime.now() - timedelta(days=days)).date().isoformat()
            end_date = datetime.now().date().isoformat()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.url_base}/transactions/get',
                    json={
                        'client_id': self.client_id,
                        'secret': self.secret,
                        'access_token': access_token,
                        'start_date': start_date,
                        'end_date': end_date,
                        'options': {
                            'count': 250,
                            'offset': 0
                        }
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get('transactions', [])
                else:
                    print(f"Error obteniendo transacciones: {response.status_code} - {response.text}")
                    return []
        except Exception as e:
            print(f"Error en get_transactions: {e}")
            return []

    async def get_accounts(self, access_token: str) -> List[Dict]:
        """Obtener lista de cuentas del usuario"""
        if self.use_mock:
            return await plaid_mock_client.get_accounts(access_token)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.url_base}/accounts/get',
                    json={
                        'client_id': self.client_id,
                        'secret': self.secret,
                        'access_token': access_token,
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get('accounts', [])
                else:
                    print(f"Error obteniendo cuentas: {response.status_code} - {response.text}")
                    return []
        except Exception as e:
            print(f"Error en get_accounts: {e}")
            return []

# Instancia global
plaid_client = PlaidClient()

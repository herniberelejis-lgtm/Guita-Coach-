import os
import httpx
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from base64 import b64encode

class PrometeoClient:
    """Cliente HTTP para Prometeo API - Open Banking para Argentina"""

    def __init__(self):
        self.api_key = os.getenv('PROMETEO_API_KEY', '')
        self.secret_key = os.getenv('PROMETEO_SECRET_KEY', '')  # Optional
        self.env = os.getenv('PROMETEO_ENV', 'sandbox')

        self.url_base = 'https://api.prometeoapi.com' if self.env == 'production' else 'https://sandbox.prometeoapi.com'

        if not self.api_key:
            raise ValueError("PROMETEO_API_KEY requerido en .env")

    def _headers(self) -> Dict[str, str]:
        """Headers para autenticar con Prometeo"""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Guita-Coach/1.0"
        }

        # Usar Bearer token con API Key
        headers["Authorization"] = f"Bearer {self.api_key}"

        return headers

    async def create_connector(self, user_id: int, user_email: str) -> Optional[str]:
        """Crear conector para que usuario autorice acceso a sus bancos"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f'{self.url_base}/v2/connectors/',
                    headers=self._headers(),
                    json={
                        'username': f'user_{user_id}',
                        'email': user_email,
                        'country': 'AR'
                    },
                    timeout=30.0
                )

                if response.status_code in [200, 201]:
                    data = response.json()
                    return data.get('uuid') or data.get('id')
                else:
                    print(f"Error Prometeo: {response.status_code} - {response.text}")
                    return None
        except Exception as e:
            print(f"Error creando conector Prometeo: {e}")
            return None

    async def get_connector_auth_url(self, connector_id: str) -> Optional[str]:
        """Obtener URL de autorización para usuario"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.url_base}/v2/connectors/{connector_id}/authorization_url/',
                    headers=self._headers(),
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get('authorization_url')
                else:
                    print(f"Error obteniendo auth URL: {response.status_code}")
                    return None
        except Exception as e:
            print(f"Error en get_connector_auth_url: {e}")
            return None

    async def get_accounts(self, connector_id: str) -> List[Dict]:
        """Obtener cuentas bancarias del usuario autorizado"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.url_base}/v2/accounts/',
                    headers=self._headers(),
                    params={'connector': connector_id},
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    accounts = data.get('results', []) if isinstance(data, dict) else data

                    # Normalizar formato
                    normalized = []
                    for acc in accounts:
                        normalized.append({
                            'account_id': acc.get('id') or acc.get('number'),
                            'name': acc.get('name') or f"Cuenta {acc.get('type', 'Unknown')}",
                            'type': acc.get('type', 'unknown'),
                            'mask': acc.get('number', '')[-4:] if acc.get('number') else 'XXXX',
                            'balance': float(acc.get('balance', 0)),
                            'currency': acc.get('currency', 'ARS'),
                            'institution': acc.get('institution', {}).get('name', 'Unknown')
                        })
                    return normalized
                else:
                    print(f"Error obteniendo cuentas: {response.status_code}")
                    return []
        except Exception as e:
            print(f"Error en get_accounts: {e}")
            return []

    async def get_transactions(self, connector_id: str, days: int = 30) -> List[Dict]:
        """Obtener transacciones de los últimos N días"""
        try:
            start_date = (datetime.now() - timedelta(days=days)).date().isoformat()
            end_date = datetime.now().date().isoformat()

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f'{self.url_base}/v2/transactions/',
                    headers=self._headers(),
                    params={
                        'connector': connector_id,
                        'created_at__gte': start_date,
                        'created_at__lte': end_date,
                        'limit': 250
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    data = response.json()
                    transactions = data.get('results', []) if isinstance(data, dict) else data

                    # Normalizar formato
                    normalized = []
                    for tx in transactions:
                        normalized.append({
                            'transaction_id': tx.get('id'),
                            'account_id': tx.get('account'),
                            'amount': float(tx.get('amount', 0)),
                            'date': tx.get('created_at', datetime.now().isoformat())[:10],
                            'name': tx.get('description') or tx.get('merchant_name', 'Transaction'),
                            'merchant_name': tx.get('merchant_name') or tx.get('description', ''),
                            'personal_finance_category': {
                                'primary': tx.get('category', 'OTHER'),
                                'detailed': tx.get('category', 'OTHER')
                            },
                            'pending': tx.get('pending', False),
                            'iso_currency_code': 'ARS',
                            'unofficial_currency_code': 'ARS'
                        })
                    return normalized
                else:
                    print(f"Error obteniendo transacciones: {response.status_code}")
                    return []
        except Exception as e:
            print(f"Error en get_transactions: {e}")
            return []

# Instancia global
prometeo_client = PrometeoClient() if (os.getenv('PROMETEO_API_KEY') and os.getenv('PROMETEO_SECRET_KEY')) else None

"""
Prometeo API Client - Open Banking para Argentina
Flujo: usuario ingresa credenciales bancarias → Prometeo las valida → devuelve session key → fetch de cuentas/movimientos
Docs: https://docs.prometeoapi.com
"""
import os
import httpx
from datetime import datetime, timedelta
from typing import Dict, List, Optional

SANDBOX_URL = "https://banking.sandbox.prometeoapi.net"
PRODUCTION_URL = "https://banking.prometeoapi.net"


class PrometeoClient:
    def __init__(self):
        self.api_key = os.getenv("PROMETEO_API_KEY", "")
        self.env = os.getenv("PROMETEO_ENV", "sandbox")
        self.base_url = SANDBOX_URL if self.env == "sandbox" else PRODUCTION_URL
        if not self.api_key:
            raise ValueError("PROMETEO_API_KEY requerido en .env")

    def _headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def list_providers(self) -> List[Dict]:
        """Listar bancos disponibles en Prometeo"""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/provider/",
                    headers=self._headers(),
                    timeout=30.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    providers = data if isinstance(data, list) else data.get("providers", [])
                    # Filtrar solo Argentina o devolver todos
                    return [
                        {"code": p.get("code") or p.get("name"), "name": p.get("name", p.get("code", "Unknown"))}
                        for p in providers
                        if isinstance(p, dict)
                    ]
                print(f"Prometeo providers error {r.status_code}: {r.text[:200]}")
                return []
        except Exception as e:
            print(f"Error listando providers Prometeo: {e}")
            return []

    async def login(self, provider: str, username: str, password: str, doc_type: str = "C") -> Optional[Dict]:
        """
        Login a un banco vía Prometeo.
        Retorna dict con session_key y status.
        Posibles status: logged_in, select_client, wrong_credentials, error
        """
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.base_url}/login/",
                    headers=self._headers(),
                    json={
                        "provider": provider,
                        "username": username,
                        "password": password,
                        "type": doc_type,
                    },
                    timeout=30.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    return {
                        "session_key": data.get("key"),
                        "status": data.get("status"),
                        "message": data.get("message", ""),
                    }
                print(f"Prometeo login error {r.status_code}: {r.text[:200]}")
                return {"status": "error", "message": f"Error {r.status_code}"}
        except Exception as e:
            print(f"Error en login Prometeo: {e}")
            return {"status": "error", "message": str(e)}

    async def get_accounts(self, session_key: str) -> List[Dict]:
        """Obtener cuentas usando session key"""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/account/",
                    headers=self._headers(),
                    params={"key": session_key},
                    timeout=30.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    accounts = data if isinstance(data, list) else data.get("accounts", [])
                    normalized = []
                    for acc in accounts:
                        normalized.append({
                            "account_id": acc.get("id") or acc.get("number"),
                            "name": acc.get("name", "Cuenta"),
                            "number": acc.get("number", ""),
                            "currency": acc.get("currency", "ARS"),
                            "balance": float(acc.get("balance", 0)),
                            "type": acc.get("type", ""),
                        })
                    return normalized
                print(f"Prometeo accounts error {r.status_code}: {r.text[:200]}")
                return []
        except Exception as e:
            print(f"Error obteniendo cuentas Prometeo: {e}")
            return []

    async def get_movements(self, session_key: str, account_number: str, currency: str = "ARS", days: int = 90) -> List[Dict]:
        """Obtener movimientos de una cuenta"""
        start = (datetime.now() - timedelta(days=days)).strftime("%d/%m/%Y")
        end = datetime.now().strftime("%d/%m/%Y")
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/movement/",
                    headers=self._headers(),
                    params={
                        "key": session_key,
                        "account_number": account_number,
                        "currency": currency,
                        "date_start": start,
                        "date_end": end,
                    },
                    timeout=30.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    movements = data if isinstance(data, list) else data.get("movements", [])
                    normalized = []
                    for mov in movements:
                        amount = float(mov.get("debit", 0) or 0) - float(mov.get("credit", 0) or 0)
                        if amount == 0:
                            amount = float(mov.get("amount", 0) or 0)
                        date_raw = mov.get("date", "")
                        try:
                            # Prometeo devuelve fechas como DD/MM/YYYY
                            if "/" in date_raw:
                                d, m, y = date_raw.split("/")
                                date_iso = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
                            else:
                                date_iso = date_raw[:10]
                        except Exception:
                            date_iso = datetime.now().date().isoformat()

                        normalized.append({
                            "transaction_id": mov.get("id", f"prom_{account_number}_{date_iso}_{amount}"),
                            "account_id": account_number,
                            "amount": amount,
                            "date": date_iso,
                            "name": mov.get("description", "Transacción"),
                            "merchant_name": mov.get("description", ""),
                            "personal_finance_category": {"primary": "OTHER", "detailed": "OTHER"},
                            "pending": False,
                            "iso_currency_code": currency,
                        })
                    return normalized
                print(f"Prometeo movements error {r.status_code}: {r.text[:200]}")
                return []
        except Exception as e:
            print(f"Error obteniendo movimientos Prometeo: {e}")
            return []


# Lazy global
_instance: Optional[PrometeoClient] = None


def get_prometeo_client() -> Optional[PrometeoClient]:
    global _instance
    if _instance is None and os.getenv("PROMETEO_API_KEY"):
        try:
            _instance = PrometeoClient()
        except ValueError:
            return None
    return _instance

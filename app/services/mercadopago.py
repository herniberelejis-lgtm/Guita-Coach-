"""
Mercado Pago OAuth + lectura de movimientos.
Requiere: MP_CLIENT_ID, MP_CLIENT_SECRET
"""
import httpx
from datetime import datetime, date, timedelta
from typing import List, Dict
from ..config import get_settings

def get_oauth_url(state: str) -> str:
    settings = get_settings()
    redirect = f"{settings.app_url}/api/auth/mp/callback"
    return (
        "https://auth.mercadopago.com/authorization"
        f"?client_id={settings.mp_client_id}"
        f"&redirect_uri={redirect}"
        f"&response_type=code"
        f"&state={state}"
    )

async def exchange_code(code: str) -> dict:
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        r = await client.post("https://api.mercadopago.com/oauth/token", data={
            "grant_type": "authorization_code",
            "client_id": settings.mp_client_id,
            "client_secret": settings.mp_client_secret,
            "code": code,
            "redirect_uri": f"{settings.app_url}/api/auth/mp/callback",
        })
        r.raise_for_status()
        return r.json()

async def fetch_movements(access_token: str, days_back: int = 30) -> List[Dict]:
    """Fetches both outgoing payments and incoming collections from Mercado Pago."""
    headers = {"Authorization": f"Bearer {access_token}"}
    since = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00.000-00:00")
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        # Egresos: pagos realizados
        url_payments = "https://api.mercadopago.com/v1/payments/search"
        offset = 0
        while True:
            resp = await client.get(url_payments, headers=headers, params={
                "sort": "date_approved", "criteria": "desc",
                "range": "date_approved", "begin_date": since,
                "limit": 50, "offset": offset
            })
            if resp.status_code not in (200, 201):
                raise Exception(f"MP payments API error {resp.status_code}: {resp.text}")
            data = resp.json()
            items = data.get("results", [])
            if not items:
                break
            for item in items:
                if item.get("status") != "approved":
                    continue
                raw_date = item.get("date_approved", "")[:10]
                results.append({
                    "id": f"mp_{item['id']}",
                    "source": "mercadopago",
                    "tx_type": "expense",
                    "amount": float(item.get("transaction_amount", 0)),
                    "currency": item.get("currency_id", "ARS"),
                    "date": raw_date,
                    "month": raw_date[:7],
                    "merchant": item.get("description") or item.get("payment_method_id", ""),
                    "provider": "MercadoPago",
                    "needs_review": False,
                    "raw_reference": str(item),
                })
            total = data.get("paging", {}).get("total", 0)
            offset += 50
            if offset >= total:
                break

        # Ingresos: cobros recibidos
        url_collections = "https://api.mercadopago.com/v1/collections/search"
        offset = 0
        while True:
            resp = await client.get(url_collections, headers=headers, params={
                "sort": "date_approved", "criteria": "desc",
                "range": "date_approved", "begin_date": since,
                "limit": 50, "offset": offset
            })
            if resp.status_code not in (200, 201):
                raise Exception(f"MP collections API error {resp.status_code}: {resp.text}")
            data = resp.json()
            items = data.get("results", [])
            if not items:
                break
            for item in items:
                if item.get("status") != "approved":
                    continue
                raw_date = item.get("date_approved", "")[:10]
                is_transfer = item.get("payment_type_id") == "money_transfer"
                description = item.get("description", "").strip()
                needs_review = is_transfer and not description
                payer_email = (item.get("payer") or {}).get("email", "")
                merchant = description or payer_email or "Transferencia recibida"
                results.append({
                    "id": f"mp_col_{item['id']}",
                    "source": "mercadopago",
                    "tx_type": "income",
                    "amount": float(item.get("transaction_amount", 0)),
                    "currency": item.get("currency_id", "ARS"),
                    "date": raw_date,
                    "month": raw_date[:7],
                    "merchant": merchant,
                    "provider": "MercadoPago",
                    "needs_review": needs_review,
                    "raw_reference": str(item),
                })
            total = data.get("paging", {}).get("total", 0)
            offset += 50
            if offset >= total:
                break

    return results

async def refresh_token(token: str) -> dict:
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        r = await client.post("https://api.mercadopago.com/oauth/token", data={
            "grant_type": "refresh_token",
            "client_secret": settings.mp_client_secret,
            "refresh_token": token,
        })
        r.raise_for_status()
        return r.json()

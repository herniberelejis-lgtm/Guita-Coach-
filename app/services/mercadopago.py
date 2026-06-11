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
    """Lee movimientos de Mercado Pago vía /v1/payments/search.

    Nota: /v1/collections/search fue dado de baja por MP (devuelve 404).
    payments/search trae pagos donde el usuario participa; la dirección se
    determina comparando collector_id / payer.id con el id del usuario.
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    since = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00.000-00:00")
    until = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00.000-00:00")
    results = []

    async with httpx.AsyncClient(timeout=30) as client:
        me_resp = await client.get("https://api.mercadopago.com/users/me", headers=headers)
        if me_resp.status_code != 200:
            raise Exception(f"MP users/me error {me_resp.status_code}: {me_resp.text}")
        my_id = str(me_resp.json().get("id", ""))

        url_payments = "https://api.mercadopago.com/v1/payments/search"
        offset = 0
        while True:
            resp = await client.get(url_payments, headers=headers, params={
                "sort": "date_approved", "criteria": "desc",
                "range": "date_approved", "begin_date": since, "end_date": until,
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
                if not raw_date:
                    continue

                collector_id = str(item.get("collector_id")
                                   or (item.get("collector") or {}).get("id") or "")
                payer = item.get("payer") or {}
                is_income = bool(my_id) and collector_id == my_id

                description = (item.get("description") or "").strip()
                is_transfer = item.get("payment_type_id") == "money_transfer"

                if is_income:
                    merchant = description or payer.get("email", "") or "Transferencia recibida"
                    needs_review = is_transfer and not description
                else:
                    merchant = description or item.get("payment_method_id", "")
                    needs_review = False

                results.append({
                    "id": f"mp_{item['id']}",
                    "source": "mercadopago",
                    "tx_type": "income" if is_income else "expense",
                    "amount": float(item.get("transaction_amount", 0)),
                    "currency": item.get("currency_id", "ARS"),
                    "date": raw_date,
                    "month": raw_date[:7],
                    "merchant": merchant,
                    "provider": "MercadoPago",
                    "needs_review": needs_review,
                    "raw_reference": str(item.get("id")),
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

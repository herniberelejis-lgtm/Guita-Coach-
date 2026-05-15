"""
Mercado Pago OAuth + lectura de movimientos.
Requiere: MP_CLIENT_ID, MP_CLIENT_SECRET
"""
from datetime import datetime, date
from ..config import get_settings

def get_oauth_url(state: str) -> str:
    settings = get_settings()
    redirect = f"{settings.app_url}/api/auth/mp/callback"
    return (
        "https://auth.mercadopago.com.ar/authorization"
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

async def fetch_movements(access_token: str) -> list[dict]:
    """Trae movimientos del mes actual."""
    import httpx
    now = date.today()
    begin = date(now.year, now.month, 1).isoformat()

    headers = {"Authorization": f"Bearer {access_token}"}
    results = []

    async with httpx.AsyncClient() as client:
        # Pagos realizados
        r = await client.get(
            "https://api.mercadopago.com/v1/payments/search",
            params={"begin_date": f"{begin}T00:00:00.000-03:00", "end_date": "NOW",
                    "sort": "date_created", "criteria": "desc", "limit": 100},
            headers=headers,
        )
        if r.status_code == 200:
            for p in r.json().get("results", []):
                if p.get("operation_type") in ("regular_payment", "money_transfer"):
                    merchant = (
                        p.get("description") or
                        p.get("merchant_order", {}).get("external_reference") or
                        "Pago Mercado Pago"
                    )
                    results.append({
                        "merchant": merchant,
                        "amount": abs(float(p.get("transaction_amount", 0))),
                        "date": p.get("date_created", "")[:10],
                        "provider": "Mercado Pago",
                        "source": "mercadopago",
                        "raw_reference": p.get("id"),
                        "confidence": 0.9,
                    })

    return results

async def refresh_token(refresh_token: str) -> dict:
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        r = await client.post("https://api.mercadopago.com/oauth/token", data={
            "grant_type": "refresh_token",
            "client_secret": settings.mp_client_secret,
            "refresh_token": refresh_token,
        })
        r.raise_for_status()
        return r.json()

"""
Gmail OAuth + parsing de emails de pago.
Requiere: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, google_credentials.json
"""
import re
import json
import base64
from datetime import datetime
from typing import Optional
from ..config import get_settings

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

_INCOME_PATTERNS = re.compile(
    r"recibiste|te acreditaron|transferencia recibida|deposito recibido|acreditaci[oó]n",
    re.IGNORECASE
)

def _is_income_email(subject_or_body: str) -> bool:
    """Returns True if the text indicates the user received money."""
    return bool(_INCOME_PATTERNS.search(subject_or_body))

def _extract_sender_name(msg: dict) -> str:
    """Extracts display name from 'Name <email@domain>' format."""
    sender = msg.get("from", "")
    match = re.match(r'^([^<]+)<', sender)
    return match.group(1).strip() if match else sender

def get_oauth_url(state: str) -> str:
    settings = get_settings()
    redirect = f"{settings.app_url}/api/auth/gmail/callback"
    return (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_client_id}"
        f"&redirect_uri={redirect}"
        f"&response_type=code"
        f"&scope=https://www.googleapis.com/auth/gmail.readonly"
        f"&access_type=offline&prompt=consent"
        f"&state={state}"
    )

async def exchange_code(code: str) -> dict:
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": f"{settings.app_url}/api/auth/gmail/callback",
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        return r.json()

async def fetch_payment_emails(access_token: str, max_results: int = 400) -> list[dict]:
    """Busca emails de confirmación de pagos en Gmail."""
    import httpx
    query = (
        "(pago OR compra OR factura OR confirmación OR pagaste OR "
        "recibiste OR acreditaron OR transferencia OR débito OR cobro) newer_than:180d"
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            params={"q": query, "maxResults": max_results},
            headers=headers,
        )
        if r.status_code != 200:
            raise Exception(f"Gmail API error {r.status_code}: {r.text}")

        messages = r.json().get("messages", [])
        results = []

        for msg in messages[:50]:
            detail = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg['id']}",
                params={"format": "full"},
                headers=headers,
            )
            if detail.status_code == 200:
                parsed = _parse_email(detail.json(), gmail_id=msg["id"])
                if parsed:
                    results.append(parsed)

    return results

def _parse_email(msg: dict, gmail_id: str = "") -> Optional[dict]:
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    subject = headers.get("subject", "")
    date_str = headers.get("date", "")
    sender = headers.get("from", "")
    snippet = msg.get("snippet", "")

    full_text = _extract_body(msg)
    text = f"{subject}\n{snippet}\n{full_text}"

    # Check income first
    unique_id = f"gmail_{gmail_id}" if gmail_id else subject

    if _is_income_email(text):
        amounts = re.findall(r'\$([\d\.]+(?:,\d{1,2})?)', text)
        amount = max((_parse_amount(a) for a in amounts), default=0.0)
        if amount >= 100:
            return {
                "merchant": _extract_sender_name({"from": sender}) or "Ingreso Gmail",
                "amount": amount,
                "date": _parse_date(date_str),
                "provider": "Gmail",
                "source": "gmail",
                "tx_type": "income",
                "raw_reference": unique_id,
                "confidence": 0.85,
            }

    # Fall through to expense detection
    result = _try_parse_mercadopago(text, subject, date_str, sender)
    if result:
        result.setdefault("tx_type", "expense")
        result["raw_reference"] = unique_id
        return result

    result = _try_parse_generic(text, subject, date_str, sender)
    if result:
        result.setdefault("tx_type", "expense")
        result["raw_reference"] = unique_id
    return result

def _extract_body(msg: dict) -> str:
    parts = msg.get("payload", {}).get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
    return ""

def _try_parse_mercadopago(text: str, subject: str, date_str: str, sender: str) -> Optional[dict]:
    if "mercadopago" not in sender.lower() and "mercadopago" not in text.lower():
        return None

    mp_pattern = re.compile(r"(?:pagaste|pago de)\s+\$\s?([\d.,]+)\s+(?:en|a)\s+(.+?)(?:\.|,|\n|$)", re.IGNORECASE)
    m = mp_pattern.search(text)
    if m:
        return {
            "merchant": m.group(2).strip(),
            "amount": _parse_amount(m.group(1)),
            "date": _parse_date(date_str),
            "provider": "Mercado Pago",
            "source": "gmail",
            "raw_reference": subject,
            "confidence": 0.92,
        }
    return None

def _try_parse_generic(text: str, subject: str, date_str: str, sender: str) -> Optional[dict]:
    amount_pattern = re.compile(r"\$\s?([\d.,]+)")
    amounts = amount_pattern.findall(text)
    if not amounts:
        return None

    amount = max(_parse_amount(a) for a in amounts)
    if amount < 100:
        return None

    merchant = _extract_merchant(sender, subject)

    return {
        "merchant": merchant or "Gasto desconocido",
        "amount": amount,
        "date": _parse_date(date_str),
        "provider": merchant or "Email",
        "source": "gmail",
        "raw_reference": subject,
        "confidence": 0.6,
    }

def _parse_amount(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))

def _extract_merchant(sender: str, subject: str) -> str:
    domain_match = re.search(r"@([a-z0-9\-]+)\.", sender.lower())
    if domain_match:
        domain = domain_match.group(1)
        known = {"mercadopago": "Mercado Pago", "rappi": "Rappi", "pedidosya": "PedidosYa",
                 "edenor": "EDENOR", "metrogas": "METROGAS", "netflix": "Netflix",
                 "spotify": "Spotify", "amazon": "Amazon", "google": "Google"}
        return known.get(domain, domain.capitalize())
    return subject.split("–")[0].split("-")[0].strip()[:40]

def _parse_date(date_str: str) -> str:
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d")

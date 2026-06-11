# tests/test_mp_income.py
import pytest
from unittest.mock import patch, MagicMock

FAKE_COLLECTION = {
    "id": "col_001",
    "transaction_amount": 5000.0,
    "currency_id": "ARS",
    "date_approved": "2026-05-10T12:00:00.000-03:00",
    "payment_type_id": "account_money",
    "description": "Pago recibido",
    "payer": {"email": "cliente@mail.com"},
    "status": "approved",
}

FAKE_TRANSFER_NO_DESC = {
    "id": "col_002",
    "transaction_amount": 2000.0,
    "currency_id": "ARS",
    "date_approved": "2026-05-11T09:00:00.000-03:00",
    "payment_type_id": "money_transfer",
    "description": "",
    "payer": {"email": "amigo@mail.com"},
    "status": "approved",
}

async def _mock_mp_get(url, *args, **kwargs):
    mock = MagicMock()
    mock.status_code = 200
    if "collections" in url:
        mock.json.return_value = {"results": [FAKE_COLLECTION, FAKE_TRANSFER_NO_DESC], "paging": {"total": 2}}
    else:
        mock.json.return_value = {"results": [], "paging": {"total": 0}}
    return mock


def _mock_async_client(*args, **kwargs):
    client = MagicMock()
    client.get = _mock_mp_get

    async def aenter(self_=None):
        return client

    async def aexit(*a):
        return False

    ctx = MagicMock()
    ctx.__aenter__ = lambda self_: aenter()
    ctx.__aexit__ = lambda self_, *a: aexit()
    return ctx

@patch("app.services.mercadopago.httpx.AsyncClient", side_effect=_mock_async_client)
def test_collections_returned_as_income(mock_get):
    from app.services.mercadopago import fetch_movements
    import asyncio
    result = asyncio.run(fetch_movements("fake_token"))
    incomes = [t for t in result if t["tx_type"] == "income"]
    assert len(incomes) >= 1
    assert incomes[0]["amount"] == 5000.0

@patch("app.services.mercadopago.httpx.AsyncClient", side_effect=_mock_async_client)
def test_money_transfer_no_desc_needs_review(mock_get):
    from app.services.mercadopago import fetch_movements
    import asyncio
    result = asyncio.run(fetch_movements("fake_token"))
    transfers = [t for t in result if t.get("needs_review") is True]
    assert len(transfers) >= 1

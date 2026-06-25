# tests/test_prices_history.py
import asyncio
import datetime as dt
from unittest.mock import MagicMock, patch

from app.services import prices as price_svc


def _chart_response(timestamps, closes):
    mock = MagicMock()
    mock.status_code = 200
    mock.raise_for_status = lambda: None
    mock.json.return_value = {
        "chart": {
            "result": [
                {
                    "timestamp": timestamps,
                    "indicators": {"quote": [{"close": closes}]},
                }
            ]
        }
    }
    return mock


def _mock_async_client_factory(get_fn):
    def _factory(*args, **kwargs):
        client = MagicMock()
        client.get = get_fn

        async def aenter():
            return client

        async def aexit():
            return False

        ctx = MagicMock()
        ctx.__aenter__ = lambda self_: aenter()
        ctx.__aexit__ = lambda self_, *a: aexit()
        return ctx

    return _factory


def setup_function(_):
    price_svc._HISTORY_CACHE.clear()


def test_fetch_price_history_returns_ascending_points():
    day1 = dt.date(2026, 1, 5)
    day2 = dt.date(2026, 1, 6)
    timestamps = [
        int(dt.datetime.combine(day1, dt.time()).timestamp()),
        int(dt.datetime.combine(day2, dt.time()).timestamp()),
    ]
    closes = [100.0, 105.5]

    async def fake_get(url, *args, **kwargs):
        return _chart_response(timestamps, closes)

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        result = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", day1)
        )

    assert len(result) == 2
    assert result[0]["date"] == day1
    assert result[0]["price"] == 100.0
    assert result[1]["date"] == day2
    assert result[1]["price"] == 105.5


def test_fetch_price_history_skips_null_closes():
    day1 = dt.date(2026, 1, 5)
    day2 = dt.date(2026, 1, 6)
    timestamps = [
        int(dt.datetime.combine(day1, dt.time()).timestamp()),
        int(dt.datetime.combine(day2, dt.time()).timestamp()),
    ]
    closes = [None, 105.5]

    async def fake_get(url, *args, **kwargs):
        return _chart_response(timestamps, closes)

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        result = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", day1)
        )

    assert len(result) == 1
    assert result[0]["price"] == 105.5


def test_fetch_price_history_returns_empty_on_error():
    async def fake_get(url, *args, **kwargs):
        raise Exception("network down")

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        result = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", dt.date(2026, 1, 5))
        )

    assert result == []


def test_fetch_price_history_returns_empty_on_malformed_payload():
    async def fake_get(url, *args, **kwargs):
        mock = MagicMock()
        mock.status_code = 200
        mock.raise_for_status = lambda: None
        mock.json.return_value = {"chart": {"result": [{}]}}
        return mock

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        result = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", dt.date(2026, 1, 5))
        )

    assert result == []


def test_fetch_price_history_uses_cache_on_second_call():
    day1 = dt.date(2026, 1, 5)
    timestamps = [int(dt.datetime.combine(day1, dt.time()).timestamp())]
    closes = [100.0]
    calls = []

    async def fake_get(url, *args, **kwargs):
        calls.append(1)
        return _chart_response(timestamps, closes)

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        first = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", day1)
        )
        second = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", day1)
        )

    assert first == second
    assert len(calls) == 1


def test_fetch_price_history_accepts_iso_string_since():
    day1 = dt.date(2026, 1, 5)
    timestamps = [int(dt.datetime.combine(day1, dt.time()).timestamp())]
    closes = [100.0]

    async def fake_get(url, *args, **kwargs):
        return _chart_response(timestamps, closes)

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        result = asyncio.run(
            price_svc.fetch_price_history("GGAL", "stock", "ARS", "2026-01-05")
        )

    assert len(result) == 1
    assert result[0]["date"] == day1


def test_fetch_price_history_uses_weekly_interval_for_long_range():
    since = dt.date.today() - dt.timedelta(days=500)
    captured_params = {}

    async def fake_get(url, *args, **kwargs):
        captured_params.update(kwargs.get("params", {}))
        return _chart_response([], [])

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        asyncio.run(price_svc.fetch_price_history("GGAL", "stock", "ARS", since))

    assert captured_params["interval"] == "1wk"


def test_fetch_price_history_uses_daily_interval_for_short_range():
    since = dt.date.today() - dt.timedelta(days=30)
    captured_params = {}

    async def fake_get(url, *args, **kwargs):
        captured_params.update(kwargs.get("params", {}))
        return _chart_response([], [])

    with patch(
        "app.services.prices.httpx.AsyncClient",
        side_effect=_mock_async_client_factory(fake_get),
    ):
        asyncio.run(price_svc.fetch_price_history("GGAL", "stock", "ARS", since))

    assert captured_params["interval"] == "1d"

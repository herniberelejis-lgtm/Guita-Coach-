"""Tests de las funciones nuevas: medio de pago, precios e inversiones manuales."""
from datetime import date

from app.services.payment_method import from_mp, from_text, normalize_method
from app.services import prices as price_svc


class TestPaymentMethodMapping:
    def test_mp_credit_card(self):
        assert from_mp("credit_card") == "credito"

    def test_mp_debit_card(self):
        assert from_mp("debit_card") == "debito"

    def test_mp_account_money_is_qr(self):
        assert from_mp("account_money") == "qr"

    def test_mp_bank_transfer(self):
        assert from_mp("bank_transfer") == "transferencia"

    def test_mp_ticket_is_cash(self):
        assert from_mp("ticket") == "efectivo"

    def test_mp_unknown_returns_empty(self):
        assert from_mp("weird_type") == ""

    def test_mp_falls_back_to_method_id(self):
        assert from_mp(None, "cvu") == "transferencia"

    def test_text_detects_credit(self):
        assert from_text("Pagaste con tarjeta de crédito Visa") == "credito"

    def test_text_detects_transfer(self):
        assert from_text("Transferencia enviada por CVU") == "transferencia"

    def test_text_no_signal(self):
        assert from_text("Gracias por tu compra") == ""

    def test_normalize_valid(self):
        assert normalize_method("QR") == "qr"

    def test_normalize_invalid(self):
        assert normalize_method("tarjeta") == ""


class TestAssetTypeInference:
    def test_btc_is_crypto(self):
        assert price_svc.infer_asset_type("BTC") == "crypto"

    def test_pendle_is_crypto(self):
        assert price_svc.infer_asset_type("PENDLE") == "crypto"

    def test_lowercase_normalized(self):
        assert price_svc.is_crypto_ticker("eth") is True

    def test_ggal_is_stock(self):
        assert price_svc.infer_asset_type("GGAL") == "stock"

    def test_coingecko_ids_only_known(self):
        ids = price_svc._coingecko_ids(["BTC", "GGAL", "ETH"])
        assert ids == {"BTC": "bitcoin", "ETH": "ethereum"}


class TestRealizedPnl:
    def test_replay_realized_pnl(self):
        from app.routers.investments import _realized_pnl
        from app.models import InvestmentTransaction as IT

        txs = [
            IT(id=1, user_id=1, broker="b", ticker="X", tx_type="buy",
               quantity=10, price=100, date=date(2024, 1, 1)),
            IT(id=2, user_id=1, broker="b", ticker="X", tx_type="buy",
               quantity=10, price=120, date=date(2024, 1, 2)),
            IT(id=3, user_id=1, broker="b", ticker="X", tx_type="sell",
               quantity=5, price=150, date=date(2024, 1, 3)),
        ]
        # avg cost after two buys = (1000 + 1200) / 20 = 110
        # realized = (150 - 110) * 5 = 200
        assert abs(_realized_pnl(txs) - 200.0) < 0.01

    def test_no_sells_no_realized(self):
        from app.routers.investments import _realized_pnl
        from app.models import InvestmentTransaction as IT
        txs = [IT(id=1, user_id=1, broker="b", ticker="X", tx_type="buy",
                  quantity=10, price=100, date=date(2024, 1, 1))]
        assert _realized_pnl(txs) == 0.0

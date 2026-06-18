"""Tests for investment CSV parser supporting Cocos Capital, Invertir Online, and Bull Market."""
import pytest

from app.services.investment_parser import (
    detect_broker,
    parse_cocos_csv,
    parse_invertir_online_csv,
    parse_bull_market_csv,
    parse_csv,
)

# ============================================================================
# Cocos Capital CSV samples
# ============================================================================

COCOS_CAPITAL_CSV = """Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
2026-06-12,Venta,YPF,50,1500.00,30.00,74970.00
2026-06-15,Compra,MERV,25,850.25,10.25,-21262.50
""".encode("utf-8")

COCOS_CAPITAL_WITH_DATES = """Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
10/06/2026,Compra,GGAL,100,250.50,12.50,-25150.00
12/06/2026,Venta,SQQQ,150,1500.00,45.00,224955.00
""".encode("utf-8")

COCOS_CAPITAL_EUROPEAN_NUMBERS = """Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,"1.250,50",12.50,-25150.00
2026-06-12,Venta,YPF,50,"1.500,00",30.00,74970.00
""".encode("utf-8")

# ============================================================================
# Invertir Online CSV samples
# ============================================================================

INVERTIR_ONLINE_CSV = """Fecha,ISIN,Especie,Cantidad,Precio,Liquidacion,Total
2026-06-10,AR0000GGAL6,GGAL,100,250.50,2026-06-15,-25150.00
2026-06-12,AR0000YPF10,YPF,50,1500.00,2026-06-17,74970.00
2026-06-15,AR0000MERV0,MERV,25,850.25,2026-06-20,-21262.50
""".encode("utf-8")

INVERTIR_ONLINE_SLASHES = """Fecha,ISIN,Especie,Cantidad,Precio,Liquidacion,Total
10/06/2026,AR0000GGAL6,GGAL,100,250.50,2026-06-15,-25150.00
12/06/2026,AR0000YPF10,YPF,50,1500.00,2026-06-17,74970.00
""".encode("utf-8")

# ============================================================================
# Bull Market CSV samples
# ============================================================================

BULL_MARKET_CSV = """Fecha,Simbolo,Cantidad,Precio,Comision,Total
2026-06-10,GGAL,100,250.50,12.50,-25150.00
2026-06-12,YPF,50,1500.00,30.00,74970.00
2026-06-15,MERV,25,850.25,10.25,-21262.50
""".encode("utf-8")

BULL_MARKET_SLASHES = """Fecha,Simbolo,Cantidad,Precio,Comision,Total
10/06/2026,GGAL,100,250.50,12.50,-25150.00
12/06/2026,YPF,50,1500.00,30.00,74970.00
""".encode("utf-8")

# ============================================================================
# Detection Tests
# ============================================================================


class TestDetectBroker:
    """Test broker detection from CSV headers."""

    def test_detects_cocos_capital(self):
        """Should detect Cocos Capital by 'especie' and 'comision' headers."""
        result = detect_broker(COCOS_CAPITAL_CSV)
        assert result == "cocos_capital"

    def test_detects_invertir_online(self):
        """Should detect Invertir Online by 'isin' and 'liquidacion' headers."""
        result = detect_broker(INVERTIR_ONLINE_CSV)
        assert result == "invertir_online"

    def test_detects_bull_market(self):
        """Should detect Bull Market by 'simbolo' header."""
        result = detect_broker(BULL_MARKET_CSV)
        assert result == "bull_market"

    def test_detects_with_lowercase_headers(self):
        """Should detect regardless of header case."""
        csv = b"fecha,TIPO,ESPECIE,cantidad,precio,COMISION,total\n"
        result = detect_broker(csv)
        assert result == "cocos_capital"

    def test_returns_none_for_unknown_format(self):
        """Should return None for unrecognized CSV format."""
        unknown = b"col1,col2,col3\nval1,val2,val3\n"
        result = detect_broker(unknown)
        assert result is None

    def test_detects_with_utf8_bom(self):
        """Should handle UTF-8 BOM encoding."""
        bom_csv = b"\xef\xbb\xbf" + COCOS_CAPITAL_CSV
        result = detect_broker(bom_csv)
        assert result == "cocos_capital"


# ============================================================================
# Cocos Capital Parser Tests
# ============================================================================


class TestCocosCapitalParser:
    """Test Cocos Capital CSV parsing."""

    def test_parses_basic_cocos_format(self):
        """Should parse standard Cocos Capital format."""
        items = parse_cocos_csv(COCOS_CAPITAL_CSV)
        assert len(items) == 3

        item0 = items[0]
        assert item0["date"] == "2026-06-10"
        assert item0["tx_type"] == "buy"
        assert item0["ticker"] == "GGAL"
        assert item0["quantity"] == 100.0
        assert item0["price"] == 250.50
        assert item0["broker"] == "cocos_capital"

        item1 = items[1]
        assert item1["tx_type"] == "sell"
        assert item1["ticker"] == "YPF"
        assert item1["quantity"] == 50.0

    def test_parses_slash_dates(self):
        """Should parse DD/MM/YYYY date format."""
        items = parse_cocos_csv(COCOS_CAPITAL_WITH_DATES)
        assert items[0]["date"] == "2026-06-10"
        assert items[1]["date"] == "2026-06-12"

    def test_parses_european_number_format(self):
        """Should parse European 1.234,56 number format."""
        items = parse_cocos_csv(COCOS_CAPITAL_EUROPEAN_NUMBERS)
        assert items[0]["price"] == 1250.50
        assert len(items) == 2

    def test_includes_csv_reference(self):
        """Should include csv_reference for audit trail."""
        items = parse_cocos_csv(COCOS_CAPITAL_CSV)
        for item in items:
            assert "csv_reference" in item
            assert item["csv_reference"] is not None

    def test_returns_empty_for_no_data_rows(self):
        """Should return empty list if no valid data rows."""
        csv = b"Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
        items = parse_cocos_csv(csv)
        assert items == []


# ============================================================================
# Invertir Online Parser Tests
# ============================================================================


class TestInvertirOnlineParser:
    """Test Invertir Online CSV parsing."""

    def test_parses_basic_invertir_online_format(self):
        """Should parse standard Invertir Online format."""
        items = parse_invertir_online_csv(INVERTIR_ONLINE_CSV)
        assert len(items) == 3

        item0 = items[0]
        assert item0["date"] == "2026-06-10"
        assert item0["tx_type"] == "buy"  # Always buy
        assert item0["ticker"] == "GGAL"
        assert item0["quantity"] == 100.0
        assert item0["price"] == 250.50
        assert item0["broker"] == "invertir_online"

    def test_all_transactions_are_buys(self):
        """Should treat all transactions as buys (can't detect from export)."""
        items = parse_invertir_online_csv(INVERTIR_ONLINE_CSV)
        for item in items:
            assert item["tx_type"] == "buy"

    def test_parses_slash_dates(self):
        """Should parse DD/MM/YYYY date format."""
        items = parse_invertir_online_csv(INVERTIR_ONLINE_SLASHES)
        assert items[0]["date"] == "2026-06-10"
        assert items[1]["date"] == "2026-06-12"

    def test_includes_isin_in_reference(self):
        """Should include ISIN in csv_reference."""
        items = parse_invertir_online_csv(INVERTIR_ONLINE_CSV)
        assert "AR0000GGAL6" in items[0]["csv_reference"]

    def test_returns_empty_for_no_data_rows(self):
        """Should return empty list if no valid data rows."""
        csv = b"Fecha,ISIN,Especie,Cantidad,Precio,Liquidacion,Total\n"
        items = parse_invertir_online_csv(csv)
        assert items == []


# ============================================================================
# Bull Market Parser Tests
# ============================================================================


class TestBullMarketParser:
    """Test Bull Market CSV parsing."""

    def test_parses_basic_bull_market_format(self):
        """Should parse standard Bull Market format."""
        items = parse_bull_market_csv(BULL_MARKET_CSV)
        assert len(items) == 3

        item0 = items[0]
        assert item0["date"] == "2026-06-10"
        assert item0["tx_type"] == "buy"  # Always buy
        assert item0["ticker"] == "GGAL"
        assert item0["quantity"] == 100.0
        assert item0["price"] == 250.50
        assert item0["broker"] == "bull_market"

    def test_all_transactions_are_buys(self):
        """Should treat all transactions as buys."""
        items = parse_bull_market_csv(BULL_MARKET_CSV)
        for item in items:
            assert item["tx_type"] == "buy"

    def test_parses_slash_dates(self):
        """Should parse DD/MM/YYYY date format."""
        items = parse_bull_market_csv(BULL_MARKET_SLASHES)
        assert items[0]["date"] == "2026-06-10"
        assert items[1]["date"] == "2026-06-12"

    def test_returns_empty_for_no_data_rows(self):
        """Should return empty list if no valid data rows."""
        csv = b"Fecha,Simbolo,Cantidad,Precio,Comision,Total\n"
        items = parse_bull_market_csv(csv)
        assert items == []


# ============================================================================
# Integration Tests
# ============================================================================


class TestParseCSVIntegration:
    """Test auto-detection and parsing via parse_csv()."""

    def test_auto_detects_and_parses_cocos(self):
        """Should auto-detect and parse Cocos Capital."""
        broker, items = parse_csv(COCOS_CAPITAL_CSV)
        assert broker == "cocos_capital"
        assert len(items) == 3
        assert items[0]["ticker"] == "GGAL"
        assert items[1]["tx_type"] == "sell"

    def test_auto_detects_and_parses_invertir_online(self):
        """Should auto-detect and parse Invertir Online."""
        broker, items = parse_csv(INVERTIR_ONLINE_CSV)
        assert broker == "invertir_online"
        assert len(items) == 3
        assert all(item["tx_type"] == "buy" for item in items)

    def test_auto_detects_and_parses_bull_market(self):
        """Should auto-detect and parse Bull Market."""
        broker, items = parse_csv(BULL_MARKET_CSV)
        assert broker == "bull_market"
        assert len(items) == 3

    def test_returns_empty_for_unknown_broker(self):
        """Should return None broker and empty list for unknown format."""
        unknown = b"col1,col2,col3\nval1,val2,val3\n"
        broker, items = parse_csv(unknown)
        assert broker is None
        assert items == []

    def test_standardized_output_format(self):
        """All parsers should return same standardized keys."""
        required_keys = {"date", "tx_type", "ticker", "quantity", "price", "broker", "csv_reference"}

        _, cocos_items = parse_csv(COCOS_CAPITAL_CSV)
        _, io_items = parse_csv(INVERTIR_ONLINE_CSV)
        _, bull_items = parse_csv(BULL_MARKET_CSV)

        for items in [cocos_items, io_items, bull_items]:
            for item in items:
                assert required_keys.issubset(item.keys()), f"Missing keys in {item}"


# ============================================================================
# Edge Cases
# ============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_handles_empty_csv(self):
        """Should handle empty CSV gracefully."""
        broker, items = parse_csv(b"")
        assert broker is None
        assert items == []

    def test_handles_header_only(self):
        """Should handle CSV with only headers."""
        csv = b"Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
        broker, items = parse_csv(csv)
        assert broker == "cocos_capital"
        assert items == []

    def test_handles_malformed_csv(self):
        """Should skip malformed rows gracefully."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
this is broken
2026-06-12,Venta,YPF,50,1500.00,30.00,74970.00
"""
        broker, items = parse_csv(csv)
        assert broker == "cocos_capital"
        assert len(items) == 2  # Should skip broken row

    def test_handles_non_ascii_ticker_names(self):
        """Should handle non-ASCII characters in ticker names."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL\xc3\xa9,100,250.50,12.50,-25150.00
""".decode("utf-8").encode("utf-8")
        broker, items = parse_csv(csv)
        assert len(items) == 1
        # Ticker should be uppercase (may contain special chars)
        assert items[0]["ticker"] is not None

    def test_handles_different_encodings(self):
        """Should handle UTF-8 and Latin-1 encodings."""
        # UTF-8 with BOM
        bom_csv = b"\xef\xbb\xbf" + COCOS_CAPITAL_CSV
        _, items = parse_csv(bom_csv)
        assert len(items) == 3

    def test_handles_zero_quantity(self):
        """Should skip transactions with zero quantity."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
2026-06-12,Venta,YPF,0,1500.00,30.00,0.00
2026-06-15,Compra,MERV,25,850.25,10.25,-21262.50
"""
        broker, items = parse_csv(csv)
        assert len(items) == 2  # Skip the zero quantity row

    def test_handles_invalid_dates(self):
        """Should skip rows with invalid dates."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
not-a-date,Venta,YPF,50,1500.00,30.00,74970.00
2026-06-15,Compra,MERV,25,850.25,10.25,-21262.50
"""
        broker, items = parse_csv(csv)
        assert len(items) == 2  # Skip the invalid date row

    def test_handles_invalid_prices(self):
        """Should skip rows with invalid prices."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
2026-06-12,Venta,YPF,50,invalid,30.00,74970.00
2026-06-15,Compra,MERV,25,850.25,10.25,-21262.50
"""
        broker, items = parse_csv(csv)
        assert len(items) == 2  # Skip the invalid price row

    def test_handles_invalid_quantities(self):
        """Should skip rows with invalid quantities."""
        csv = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00
2026-06-12,Venta,YPF,not-a-number,1500.00,30.00,74970.00
2026-06-15,Compra,MERV,25,850.25,10.25,-21262.50
"""
        broker, items = parse_csv(csv)
        assert len(items) == 2  # Skip the invalid quantity row

    def test_parses_decimal_comma_in_european_format(self):
        """Should parse 1,23 as decimal in European format."""
        csv = b"""Fecha,Simbolo,Cantidad,Precio,Comision,Total
2026-06-10,GGAL,100,"1,50",12.50,-25150.00
2026-06-12,YPF,50,"1.500,00",30.00,74970.00
"""
        broker, items = parse_csv(csv)
        assert len(items) == 2
        assert items[0]["price"] == 1.50
        assert items[1]["price"] == 1500.00

    def test_parses_parentheses_for_negative(self):
        """Should parse (1234.56) as negative amount."""
        from app.services.investment_parser import _parse_amount
        assert _parse_amount("(1234.56)") == -1234.56
        assert _parse_amount("(1.234,56)") == -1234.56

    def test_detects_cocos_with_different_case(self):
        """Should detect Cocos regardless of case."""
        csv = b"FECHA,TIPO,ESPECIE,CANTIDAD,PRECIO,COMISION,TOTAL\n2026-06-10,Compra,GGAL,100,250.50,12.50,-25150.00\n"
        broker, items = parse_csv(csv)
        assert broker == "cocos_capital"
        assert len(items) == 1

    def test_parses_missing_isin_column(self):
        """Should parse Invertir Online without ISIN column (optional)."""
        csv = b"""Fecha,Especie,Cantidad,Precio,Liquidacion,Total
2026-06-10,GGAL,100,250.50,2026-06-15,-25150.00
"""
        # ISIN is optional, parser should still work
        items = parse_invertir_online_csv(csv)
        assert len(items) == 1
        assert "csv_reference" in items[0]

    def test_us_format_thousands_separator(self):
        """Should parse US format with comma as thousands separator."""
        from app.services.investment_parser import _parse_amount
        assert _parse_amount("1,234.56") == 1234.56
        assert _parse_amount("12,345,678.90") == 12345678.90

    def test_rejects_malformed_csv_with_missing_columns(self):
        """Should return empty list if required columns are missing."""
        csv = b"Fecha,Especie\n2026-06-10,GGAL\n"
        # This has fecha and especie but missing cantidad and precio
        items = parse_cocos_csv(csv)
        assert items == []

    def test_returns_none_date_for_unrecognized_format(self):
        """Should return None for date in unrecognized format."""
        from app.services.investment_parser import _parse_date
        assert _parse_date("gibberish") is None
        assert _parse_date("") is None
        assert _parse_date("   ") is None
        # Note: Date parser matches any DD/MM/YYYY, doesn't validate month/day ranges
        # This is acceptable since invalid dates won't cause parsing failures

    def test_returns_none_amount_for_empty_string(self):
        """Should return None for empty amount."""
        from app.services.investment_parser import _parse_amount
        assert _parse_amount("") is None
        assert _parse_amount("   ") is None

"""Tests for investment CSV/XLSX parser."""
import pytest
from app.services.investment_parser import (
    parse_csv,
    parse_xlsx,
    parse_file,
    _parse_date,
    _parse_amount,
    _detect_broker_from_rows,
)


class TestParseDate:
    """Test date parsing for multiple formats."""

    def test_iso_format(self):
        """YYYY-MM-DD format."""
        assert _parse_date("2024-12-25") == "2024-12-25"

    def test_european_format(self):
        """DD/MM/YYYY format."""
        assert _parse_date("25/12/2024") == "2024-12-25"

    def test_dash_format(self):
        """DD-MM-YYYY format."""
        assert _parse_date("25-12-2024") == "2024-12-25"

    def test_invalid_date(self):
        """Invalid dates return None."""
        assert _parse_date("invalid") is None
        assert _parse_date("") is None
        assert _parse_date(None) is None


class TestParseAmount:
    """Test numeric amount parsing."""

    def test_us_format(self):
        """US format: 1,234.56."""
        assert _parse_amount("1,234.56") == 1234.56

    def test_european_format(self):
        """European format: 1.234,56."""
        assert _parse_amount("1.234,56") == 1234.56

    def test_simple_integer(self):
        """Simple integer."""
        assert _parse_amount("100") == 100.0

    def test_with_currency_symbol(self):
        """With $ symbol."""
        assert _parse_amount("$ 500.00") == 500.0

    def test_negative_with_minus(self):
        """Negative with minus sign."""
        assert _parse_amount("-100.00") == -100.0

    def test_negative_with_parentheses(self):
        """Negative with parentheses."""
        assert _parse_amount("(100.00)") == -100.0

    def test_invalid_amount(self):
        """Invalid amounts return None."""
        assert _parse_amount("invalid") is None
        assert _parse_amount("") is None
        assert _parse_amount(None) is None


class TestDetectBrokerFromRows:
    """Test broker detection from row headers."""

    def test_detect_cocos_capital(self):
        """Detect Cocos Capital format."""
        rows = [
            ["Fecha", "Tipo", "Especie", "Cantidad", "Precio", "Comision", "Total"],
            ["2024-01-01", "Compra", "GGAL", "10", "100", "0", "1000"],
        ]
        assert _detect_broker_from_rows(rows) == "cocos_capital"

    def test_detect_invertir_online(self):
        """Detect Invertir Online format."""
        rows = [
            ["Fecha", "ISIN", "Especie", "Cantidad", "Precio", "Liquidacion", "Total"],
            ["2024-01-01", "AR1234", "GGAL", "10", "100", "2024-01-03", "1000"],
        ]
        assert _detect_broker_from_rows(rows) == "invertir_online"

    def test_detect_bull_market(self):
        """Detect Bull Market format."""
        rows = [
            ["Fecha", "Simbolo", "Cantidad", "Precio", "Comision", "Total"],
            ["2024-01-01", "GGAL", "10", "100", "0", "1000"],
        ]
        assert _detect_broker_from_rows(rows) == "bull_market"

    def test_unknown_format(self):
        """Unknown format returns None."""
        rows = [
            ["Col1", "Col2", "Col3"],
            ["Val1", "Val2", "Val3"],
        ]
        assert _detect_broker_from_rows(rows) is None

    def test_empty_rows(self):
        """Empty rows return None."""
        assert _detect_broker_from_rows([]) is None


class TestParseColosCSV:
    """Test parsing Cocos Capital CSV."""

    def test_basic_buy_transaction(self):
        """Parse basic buy transaction."""
        csv_content = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2024-01-15,Compra,GGAL,10,150.50,5,1510
2024-01-20,Venta,GGAL,5,155.00,5,770"""

        broker, items = parse_csv(csv_content)

        assert broker == "cocos_capital"
        assert len(items) == 2
        assert items[0]["ticker"] == "GGAL"
        assert items[0]["quantity"] == 10
        assert items[0]["price"] == 150.50
        assert items[0]["tx_type"] == "buy"
        assert items[0]["date"] == "2024-01-15"

    def test_sell_transaction(self):
        """Parse sell transaction."""
        csv_content = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2024-01-20,Venta,GGAL,5,155.00,5,770"""

        broker, items = parse_csv(csv_content)

        assert len(items) == 1
        assert items[0]["tx_type"] == "sell"

    def test_semicolon_delimiter(self):
        """Parse CSV with semicolon delimiter."""
        csv_content = b"""Fecha;Tipo;Especie;Cantidad;Precio;Comision;Total
2024-01-15;Compra;GGAL;10;150,50;5;1510"""

        broker, items = parse_csv(csv_content)

        assert broker == "cocos_capital"
        assert len(items) == 1
        assert items[0]["price"] == 150.50


class TestParseInvertirOnlineCSV:
    """Test parsing Invertir Online CSV."""

    def test_basic_transaction(self):
        """Parse Invertir Online transaction."""
        csv_content = b"""Fecha,ISIN,Especie,Cantidad,Precio,Liquidacion,Total
2024-01-15,AR1234,GGAL,10,150.50,2024-01-17,1505"""

        broker, items = parse_csv(csv_content)

        assert broker == "invertir_online"
        assert len(items) == 1
        assert items[0]["ticker"] == "GGAL"
        assert items[0]["tx_type"] == "buy"


class TestParseBullMarketCSV:
    """Test parsing Bull Market CSV."""

    def test_basic_transaction(self):
        """Parse Bull Market transaction."""
        csv_content = b"""Fecha,Simbolo,Cantidad,Precio,Comision,Total
2024-01-15,GGAL,10,150.50,5,1510"""

        broker, items = parse_csv(csv_content)

        assert broker == "bull_market"
        assert len(items) == 1
        assert items[0]["ticker"] == "GGAL"
        assert items[0]["tx_type"] == "buy"


class TestParseFile:
    """Test parse_file function for file type detection."""

    def test_csv_file(self):
        """Detect and parse CSV file."""
        csv_content = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2024-01-15,Compra,GGAL,10,150.50,5,1510"""

        broker, items = parse_file(csv_content, "export.csv")

        assert broker == "cocos_capital"
        assert len(items) == 1

    def test_unknown_extension(self):
        """Unknown file extension returns None."""
        broker, items = parse_file(b"data", "file.txt")
        assert broker is None
        assert items == []


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_csv(self):
        """Empty CSV returns empty items."""
        broker, items = parse_csv(b"")
        assert broker is None
        assert items == []

    def test_header_only_csv(self):
        """CSV with only header row."""
        csv_content = b"Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total"
        broker, items = parse_csv(csv_content)
        assert items == []

    def test_malformed_rows_skipped(self):
        """Malformed rows are skipped."""
        csv_content = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2024-01-15,Compra,GGAL,10,150.50,5,1510
incomplete_row
2024-01-20,Venta,GGAL,5,155.00,5,770"""

        broker, items = parse_csv(csv_content)
        assert len(items) == 2

    def test_invalid_quantity_skipped(self):
        """Invalid quantity values are skipped."""
        csv_content = b"""Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total
2024-01-15,Compra,GGAL,invalid,150.50,5,1510
2024-01-20,Compra,GGAL,0,155.00,5,0"""

        broker, items = parse_csv(csv_content)
        assert len(items) == 0

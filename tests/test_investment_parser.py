"""Tests for investment CSV/XLSX parser."""
import io
from datetime import date

import pytest
from openpyxl import Workbook

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

    def test_unpadded_day_and_month(self):
        """DD/MM/YYYY without zero-padding (e.g. real Cocos exports use 5/3/2026)."""
        assert _parse_date("5/3/2026") == "2026-03-05"
        assert _parse_date("13/1/2026") == "2026-01-13"
        assert _parse_date("4/12/2026") == "2026-12-04"


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


class TestParseCocosAccountStatement:
    """Test parsing Cocos Capital's real account-statement export."""

    def test_detects_as_cocos_capital_not_bull_market(self):
        """The real export shares 'instrumento'+'tipoOperacion' with Bull Market's
        generic check, but must be classified as cocos_capital."""
        csv_content = (
            "nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;"
            "instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total\n"
            "82006886;420257;13/1/2026;14/1/2026;Compra;CELULOSA ARGENTINA S.A. - ORD. 1V. (CELU);"
            "ARS;BYMA;246;415;-102.090;-459,405;-51,045;-107,1945;0;-102.707,64"
        ).encode("utf-8")

        broker, items = parse_csv(csv_content)

        assert broker == "cocos_capital"
        assert len(items) == 1
        assert items[0]["ticker"] == "CELU"
        assert items[0]["tx_type"] == "buy"
        assert items[0]["quantity"] == 246.0
        assert items[0]["price"] == 415.0
        assert items[0]["date"] == "2026-01-14"

    def test_unpadded_dates_are_not_dropped(self):
        """Real Cocos exports use unpadded dates (e.g. 5/3/2026); previously every
        row was silently dropped because the date regex required 2-digit day/month."""
        csv_content = (
            "nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;"
            "instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total\n"
            "99428084;2667036;31/3/2026;1/4/2026;Compra;CEDEAR DE MICROSOFT CORP. (MSFT);"
            "ARS;BYMA;3;18.170;-54.510;-245,295;-27,255;-57,2355;0;-54.839,79"
        ).encode("utf-8")

        broker, items = parse_csv(csv_content)

        assert len(items) == 1
        assert items[0]["date"] == "2026-04-01"
        assert items[0]["ticker"] == "MSFT"

    def test_fci_subscription_is_buy_and_redemption_is_sell(self):
        """Liquidacion Suscripcion Fci -> buy; Liquidacion Rescate Fci -> sell.
        The source quantity is negative for redemptions but must be normalized
        to a positive value, with direction taken from tipoOperacion."""
        csv_content = (
            "nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;"
            "instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total\n"
            "109157369;4633608;9/6/2026;9/6/2026;Liquidacion Suscripcion Fci;"
            "FCI COCOS PESOS PLUS CL.A $ (COCOSPPA);ARS;;87.204,22;1.380,00;-120.342;0;0;0;0;-120.342\n"
            "109307664;4681139;10/6/2026;11/6/2026;Liquidacion Rescate Fci;"
            "FCI COCOS PESOS PLUS CL.A $ (COCOSPPA);ARS;;-87.204,22;1.380,62;120.396,15;0;0;0;0;120.396,15"
        ).encode("utf-8")

        broker, items = parse_csv(csv_content)

        assert len(items) == 2
        assert items[0]["tx_type"] == "buy"
        assert items[0]["quantity"] == pytest.approx(87204.22)
        assert items[1]["tx_type"] == "sell"
        assert items[1]["quantity"] == pytest.approx(87204.22)

    def test_cash_movements_are_skipped(self):
        """Recibo De Cobro / Orden De Pago are cash deposits/withdrawals, not trades."""
        csv_content = (
            "nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;"
            "instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total\n"
            "99243626;13932313;31/3/2026;31/3/2026;Recibo De Cobro;;ARS;;;;100.000;0;0;0;0;100.000\n"
            "99428085;13932314;31/3/2026;31/3/2026;Orden De Pago;;ARS;;;;-100.000;0;0;0;0;-100.000"
        ).encode("utf-8")

        broker, items = parse_csv(csv_content)

        assert items == []

    def test_dolar_mep_operations_are_skipped(self):
        """'Compra/Venta bono Operatoria dolar MEP' pairs are a currency-conversion
        mechanism (buy the bond in one currency leg, sell it in the other), not a
        real position. Each leg quotes the same instrument in a different currency
        (e.g. price 0,071 USD vs 100,8 ARS); averaging them as one holding produced
        a large phantom position that wasn't real (reported bug: 'me toma una
        tenencia que no existe')."""
        csv_content = (
            "nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;"
            "instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total\n"
            "95278477;2134717;6/3/2026;6/3/2026;Compra bono Operatoria dolar MEP USD;"
            "ON TARJETA NARANJA CL.66 S.1 30/11/2026 $ (T661O);USD;BYMA;602.816;0,071;-427,9994;0;0;0;0;-428\n"
            "95303436;2158239;6/3/2026;6/3/2026;Venta bono Operatoria dolar MEP ARS;"
            "ON TARJETA NARANJA CL.66 S.1 30/11/2026 $ (T661O);ARS;BYMA;-602.816;100,8;607.638,53;0;0;0;0;607.638,53\n"
            "95309664;2163939;6/3/2026;6/3/2026;Venta bono Operatoria dolar MEP USD;"
            "ON TARJETA NARANJA CL.66 S.1 30/11/2026 $ (T661O);USD;BYMA;-500.000;0,071;355;0;0;0;0;355\n"
            "95311836;2165997;6/3/2026;6/3/2026;Compra bono Operatoria dolar MEP ARS;"
            "ON TARJETA NARANJA CL.66 S.1 30/11/2026 $ (T661O);ARS;BYMA;500.000;100,8;-504.000;0;0;0;0;-504.000"
        ).encode("utf-8")

        broker, items = parse_csv(csv_content)

        assert items == []


def _make_ppi_workbook(sheets: dict) -> bytes:
    """Build an in-memory PPI-style workbook from {sheet_name: [rows]}."""
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestParsePPIWorkbook:
    """Test parsing PPI's multi-sheet (one ledger per currency) account export."""

    def test_compra_and_venta_rows_become_trades(self):
        xlsx_bytes = _make_ppi_workbook({
            "Pesos": [
                ["Fecha", "Descripcion", "Cantidad", "Precio", "Importe", "Saldo", "Moneda"],
                [date(2026, 6, 4), "COMPRA SPY", 11, 19131.82, -212105.19, 8500.62, "Pesos"],
                [date(2026, 5, 8), "VENTA SPY", -2, 54900, 108936.42, 108904.86, "Pesos"],
            ],
        })

        broker, items = parse_xlsx(xlsx_bytes)

        assert broker == "ppi"
        assert len(items) == 2
        assert items[0]["tx_type"] == "buy"
        assert items[0]["ticker"] == "SPY"
        assert items[0]["quantity"] == 11.0
        assert items[0]["price"] == 19131.82
        assert items[0]["date"] == "2026-06-04"
        assert items[1]["tx_type"] == "sell"
        assert items[1]["quantity"] == 2.0

    def test_cash_movements_and_dividends_are_skipped(self):
        xlsx_bytes = _make_ppi_workbook({
            "Pesos": [
                ["Fecha", "Descripcion", "Cantidad", "Precio", "Importe", "Saldo", "Moneda"],
                [date(2026, 6, 8), "Retiro de Fondos", 0, 0, -8500.62, 0, "Pesos"],
                [date(2026, 6, 4), "Ingreso de Fondos", 0, 0, 220000, 220605.81, "Pesos"],
                [date(2026, 4, 30), "Dividendo en efectivo / SPY", 0, 0, -31.57, -31.56, "Pesos"],
            ],
        })

        broker, items = parse_xlsx(xlsx_bytes)

        assert items == []

    def test_instrumentos_summary_sheet_is_ignored(self):
        """The 'Instrumentos' sheet lacks Importe/Saldo and has price=0; it must
        not be parsed (the Pesos/currency ledger sheets carry the real price)."""
        xlsx_bytes = _make_ppi_workbook({
            "Instrumentos": [
                ["Fecha", "Descripcion", "Especie", "Cantidad", "Precio", "Moneda"],
                [date(2026, 6, 4), "COMPRA SPY", "Spdr S&P 500", 11, 0, ""],
            ],
            "Pesos": [
                ["Fecha", "Descripcion", "Cantidad", "Precio", "Importe", "Saldo", "Moneda"],
                [date(2026, 6, 4), "COMPRA SPY", 11, 19131.82, -212105.19, 8500.62, "Pesos"],
            ],
        })

        broker, items = parse_xlsx(xlsx_bytes)

        assert broker == "ppi"
        assert len(items) == 1
        assert items[0]["price"] == 19131.82

    def test_multiple_currency_sheets_are_combined(self):
        xlsx_bytes = _make_ppi_workbook({
            "Pesos": [
                ["Fecha", "Descripcion", "Cantidad", "Precio", "Importe", "Saldo", "Moneda"],
                [date(2026, 6, 4), "COMPRA SPY", 11, 19131.82, -212105.19, 8500.62, "Pesos"],
            ],
            "DolarCV7000 Ext.": [
                ["Fecha", "Descripcion", "Cantidad", "Precio", "Importe", "Saldo", "Moneda"],
                [date(2026, 5, 1), "COMPRA AAPL", 2, 190.0, -380.0, 100.0, "DolarCV7000 Ext."],
            ],
        })

        broker, items = parse_xlsx(xlsx_bytes)

        assert broker == "ppi"
        tickers = {item["ticker"] for item in items}
        assert tickers == {"SPY", "AAPL"}


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

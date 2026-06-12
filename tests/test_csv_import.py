"""Tests del importador de estado de cuenta de Mercado Pago."""
import pytest

from app.services.csv_import import parse_mp_csv, _parse_amount, _parse_date

MP_CSV = """Fecha;Descripción;ID de la operación;Valor;Saldo
02/06/2026;Compra en Coto Suc 12;12345678;-15.300,50;120.000,00
03/06/2026;Carga SUBE;12345679;-2.000,00;118.000,00
04/06/2026;Transferencia recibida;12345680;50.000,00;168.000,00
;;;;
""".encode("utf-8")


def test_parses_mp_csv_semicolon():
    items = parse_mp_csv(MP_CSV)
    assert len(items) == 3
    coto = items[0]
    assert coto["tx_type"] == "expense"
    assert coto["amount"] == 15300.50
    assert coto["date"] == "2026-06-02"
    assert coto["merchant"] == "Compra en Coto Suc 12"
    assert coto["source"] == "mp_csv"
    assert coto["raw_reference"] == "mpcsv_12345678"
    assert items[2]["tx_type"] == "income"
    assert items[2]["amount"] == 50000.0


def test_parses_comma_delimited_english_headers():
    csv = (
        "date,description,amount\n"
        "2026-06-05,Netflix,-9999.99\n"
    ).encode()
    items = parse_mp_csv(csv)
    assert len(items) == 1
    assert items[0]["amount"] == 9999.99
    assert items[0]["tx_type"] == "expense"


def test_rejects_file_without_columns():
    with pytest.raises(ValueError):
        parse_mp_csv(b"hola\neste,no,es\nun,reporte,valido\n")


def test_skips_zero_and_broken_rows():
    csv = (
        "Fecha;Descripción;Valor\n"
        "01/06/2026;Nada;0,00\n"
        "fecha-rota;Algo;-100,00\n"
        "02/06/2026;Válida;-100,00\n"
    ).encode()
    items = parse_mp_csv(csv)
    assert len(items) == 1
    assert items[0]["merchant"] == "Válida"


@pytest.mark.parametrize("raw,expected", [
    ("-1.234,56", -1234.56),
    ("1,234.56", 1234.56),
    ("$ 500", 500.0),
    ("(300,00)", -300.0),
    ("", None),
    ("abc", None),
])
def test_parse_amount_formats(raw, expected):
    assert _parse_amount(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("2026-06-02", "2026-06-02"),
    ("02/06/2026", "2026-06-02"),
    ("02-06-2026", "2026-06-02"),
    ("junk", None),
])
def test_parse_date_formats(raw, expected):
    assert _parse_date(raw) == expected

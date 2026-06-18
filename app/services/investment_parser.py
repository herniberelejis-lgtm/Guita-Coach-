"""Investment CSV/XLSX parser for Argentine brokers: Cocos Capital, Invertir Online, Bull Market.

Each broker exports transactions in a different format. This module:
1. Auto-detects the broker format by inspecting headers
2. Parses the file according to broker-specific format
3. Returns standardized transaction dicts with keys:
   - date (YYYY-MM-DD format)
   - tx_type ("buy" or "sell")
   - ticker (uppercase)
   - quantity (float)
   - price (float)
   - broker (string)
   - csv_reference (for audit trail)

Handles edge cases:
- Empty rows and malformed data (skipped)
- Multiple date formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
- European and US number formats (1.234,56 vs 1,234.56)
- Non-ASCII characters
- UTF-8 and Latin-1 encodings
- Excel files (.xlsx) with openpyxl
"""
import csv
import io
import re
from typing import Optional, Tuple

try:
    from openpyxl import load_workbook
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False


_DATE_PATTERNS = (
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})"), lambda m: f"{m[1]}-{m[2]}-{m[3]}"),
    (re.compile(r"^(\d{2})/(\d{2})/(\d{4})"), lambda m: f"{m[3]}-{m[2]}-{m[1]}"),
    (re.compile(r"^(\d{2})-(\d{2})-(\d{4})"), lambda m: f"{m[3]}-{m[2]}-{m[1]}"),
)


def _parse_date(raw: str) -> Optional[str]:
    """Parse date in multiple formats to YYYY-MM-DD.

    Supports: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
    Returns None if date cannot be parsed.
    """
    raw = (raw or "").strip()
    for pattern, build in _DATE_PATTERNS:
        m = pattern.match(raw)
        if m:
            return build(m)
    return None


def _parse_amount(raw: str) -> Optional[float]:
    """Parse numeric amount handling European and US formats.

    Supports:
    - '-1.234,56' (European: thousands separator=dot, decimal=comma)
    - '1,234.56' (US: thousands separator=comma, decimal=dot)
    - '22,1225' (European with 4 decimals)
    - '$ 500' (with currency symbol)
    - '(300,00)' (parentheses for negative)

    Returns None if amount cannot be parsed.
    """
    raw = (raw or "").strip().replace("$", "").replace(" ", "")
    if not raw:
        return None

    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    raw = raw.strip("()-+")

    # Detect if we have both comma and dot
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            # European: 1.234,56 (comma is rightmost = decimal)
            raw = raw.replace(".", "").replace(",", ".")
        else:
            # US: 1,234.56 (dot is rightmost = decimal)
            raw = raw.replace(",", "")
    elif "," in raw:
        # Only comma: could be European (1,23) or US thousands (1,000)
        # If comma leaves more than 2 digits after, it's decimal (e.g. 22,1225)
        # If comma leaves 1-2 digits after, it's decimal (e.g. 1,23)
        head, _, tail = raw.rpartition(",")
        if head and all(c.isdigit() for c in head):
            # It's a valid number, comma is decimal
            raw = f"{head.replace('.', '')}.{tail}"
        else:
            raw = raw.replace(",", "")  # US thousands or invalid
    elif "." in raw:
        # Only dot: could be thousands separator or decimal point
        # If dot leaves more than 2 digits, it's thousands separator
        # If dot leaves 1-2 digits, it's decimal
        head, _, tail = raw.rpartition(".")
        if len(tail) <= 2 and head and all(c.isdigit() for c in head):
            # Decimal point (e.g., "123.45" or "123.5")
            raw = f"{head}.{tail}"
        else:
            # Thousands separator or invalid
            raw = raw.replace(".", "")

    try:
        value = float(raw)
    except ValueError:
        return None

    return -value if negative else value


def _read_text(content: bytes) -> Optional[str]:
    """Decode bytes to text trying multiple encodings."""
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return None


def _detect_delimiter(text: str) -> str:
    """Detect CSV delimiter by counting ; vs , in first few lines."""
    first_lines = "\n".join(text.split("\n")[:5])
    return ";" if first_lines.count(";") > first_lines.count(",") else ","


def _get_headers_lower(row: list[str]) -> list[str]:
    """Return list of lowercase, stripped header names."""
    return [cell.lower().strip() for cell in row]


def detect_broker(csv_bytes: bytes) -> Optional[str]:
    """Auto-detect broker format from CSV headers.

    Returns one of: "cocos_capital", "invertir_online", "bull_market", or None.

    Detection strategy:
    - Cocos Capital: has 'especie' AND 'comision' in headers
    - Invertir Online: has 'isin' AND 'liquidacion' in headers
    - Bull Market: has 'simbolo' OR ('instrumento' AND 'tipooperacion') in headers
    """
    text = _read_text(csv_bytes)
    if not text:
        return None

    delimiter = _detect_delimiter(text)
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))

    if not rows:
        return None

    headers = _get_headers_lower(rows[0])

    # Check for Cocos Capital (has both especie and comision)
    if "especie" in headers and "comision" in headers:
        return "cocos_capital"

    # Check for Invertir Online (has both isin and liquidacion)
    if "isin" in headers and "liquidacion" in headers:
        return "invertir_online"

    # Check for Bull Market (has simbolo OR instrumento+tipooperacion)
    if "simbolo" in headers:
        return "bull_market"
    if "instrumento" in headers and "tipooperacion" in headers:
        return "bull_market"

    return None


def parse_cocos_csv(csv_bytes: bytes) -> list[dict]:
    """Parse Cocos Capital CSV format.

    Expected columns: Fecha, Tipo, Especie, Cantidad, Precio, Comision, Total
    Tipo values: "Compra" (buy) or "Venta" (sell)
    """
    text = _read_text(csv_bytes)
    if not text:
        return []

    delimiter = _detect_delimiter(text)
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))

    if not rows:
        return []

    headers = _get_headers_lower(rows[0])

    # Find column indices
    col_indices = {}
    for i, h in enumerate(headers):
        if "fecha" in h:
            col_indices["fecha"] = i
        elif "tipo" in h:
            col_indices["tipo"] = i
        elif "especie" in h:
            col_indices["especie"] = i
        elif "cantidad" in h:
            col_indices["cantidad"] = i
        elif "precio" in h:
            col_indices["precio"] = i

    # Validate we have minimum required columns
    required = {"fecha", "tipo", "especie", "cantidad", "precio"}
    if not required.issubset(col_indices.keys()):
        return []

    items = []
    for row in rows[1:]:
        if len(row) <= max(col_indices.values()):
            continue

        date = _parse_date(row[col_indices["fecha"]])
        if not date:
            continue

        tx_type_raw = row[col_indices["tipo"]].strip()
        tx_type = "sell" if "venta" in tx_type_raw.lower() else "buy"

        ticker = row[col_indices["especie"]].strip().upper()
        if not ticker:
            continue

        quantity = _parse_amount(row[col_indices["cantidad"]])
        if quantity is None or quantity <= 0:
            continue

        price = _parse_amount(row[col_indices["precio"]])
        if price is None or price <= 0:
            continue

        csv_reference = f"cocos_{date}_{ticker}_{quantity}"

        items.append({
            "date": date,
            "tx_type": tx_type,
            "ticker": ticker,
            "quantity": quantity,
            "price": price,
            "broker": "cocos_capital",
            "csv_reference": csv_reference,
        })

    return items


def parse_invertir_online_csv(csv_bytes: bytes) -> list[dict]:
    """Parse Invertir Online CSV format.

    Expected columns: Fecha, ISIN, Especie, Cantidad, Precio, Liquidacion, Total
    Note: Invertir Online doesn't export transaction type, so all are treated as buy.
    """
    text = _read_text(csv_bytes)
    if not text:
        return []

    delimiter = _detect_delimiter(text)
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))

    if not rows:
        return []

    headers = _get_headers_lower(rows[0])

    # Find column indices
    col_indices = {}
    for i, h in enumerate(headers):
        if "fecha" in h:
            col_indices["fecha"] = i
        elif "isin" in h:
            col_indices["isin"] = i
        elif "especie" in h:
            col_indices["especie"] = i
        elif "cantidad" in h:
            col_indices["cantidad"] = i
        elif "precio" in h:
            col_indices["precio"] = i

    # Validate we have minimum required columns
    required = {"fecha", "especie", "cantidad", "precio"}
    if not required.issubset(col_indices.keys()):
        return []

    items = []
    for row in rows[1:]:
        if len(row) <= max(col_indices.values()):
            continue

        date = _parse_date(row[col_indices["fecha"]])
        if not date:
            continue

        ticker = row[col_indices["especie"]].strip().upper()
        if not ticker:
            continue

        quantity = _parse_amount(row[col_indices["cantidad"]])
        if quantity is None or quantity <= 0:
            continue

        price = _parse_amount(row[col_indices["precio"]])
        if price is None or price <= 0:
            continue

        isin = row[col_indices["isin"]].strip() if "isin" in col_indices else ""
        csv_reference = f"io_{isin}_{date}_{ticker}" if isin else f"io_{date}_{ticker}"

        items.append({
            "date": date,
            "tx_type": "buy",  # Invertir Online doesn't export transaction type
            "ticker": ticker,
            "quantity": quantity,
            "price": price,
            "broker": "invertir_online",
            "csv_reference": csv_reference,
        })

    return items


def parse_bull_market_csv(csv_bytes: bytes) -> list[dict]:
    """Parse Bull Market CSV format.

    Supports two formats:
    1. Simple: Fecha, Simbolo, Cantidad, Precio
    2. Full: fechaEjecucion, instrumento, tipoOperacion, cantidad, precio

    Note: Old format treats all as buy. New format detects Compra/Venta.
    """
    text = _read_text(csv_bytes)
    if not text:
        return []

    delimiter = _detect_delimiter(text)
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))

    if not rows:
        return []

    headers = _get_headers_lower(rows[0])

    # Find column indices
    col_indices = {}
    for i, h in enumerate(headers):
        if "fecha" in h:
            col_indices["fecha"] = i
        elif "simbolo" in h:
            col_indices["simbolo"] = i
        elif "instrumento" in h:
            col_indices["instrumento"] = i
        elif "tipooperacion" in h:
            col_indices["tipooperacion"] = i
        elif "cantidad" in h:
            col_indices["cantidad"] = i
        elif "precio" in h:
            col_indices["precio"] = i

    # Validate we have minimum required columns
    has_fecha = "fecha" in col_indices
    has_ticker = "simbolo" in col_indices or "instrumento" in col_indices
    has_qty = "cantidad" in col_indices
    has_price = "precio" in col_indices

    if not (has_fecha and has_ticker and has_qty and has_price):
        return []

    items = []
    for row in rows[1:]:
        if len(row) <= max(col_indices.values()):
            continue

        date = _parse_date(row[col_indices["fecha"]])
        if not date:
            continue

        # Extract ticker from either simbolo or instrumento
        ticker_raw = ""
        if "simbolo" in col_indices:
            ticker_raw = row[col_indices["simbolo"]].strip()
        elif "instrumento" in col_indices:
            ticker_raw = row[col_indices["instrumento"]].strip()
            # Extract ticker from "COMPANY NAME (TICKER)" format
            if "(" in ticker_raw and ")" in ticker_raw:
                ticker_raw = ticker_raw[ticker_raw.rfind("(") + 1:ticker_raw.rfind(")")]

        ticker = ticker_raw.upper()
        if not ticker:
            continue

        quantity_raw = row[col_indices["cantidad"]]
        quantity = _parse_amount(quantity_raw)
        if quantity is None or quantity == 0:
            continue

        price_raw = row[col_indices["precio"]]
        price = _parse_amount(price_raw)
        if price is None or price <= 0:
            continue

        # Detect transaction type from tipoOperacion if available
        tx_type = "buy"
        if "tipooperacion" in col_indices:
            tx_type_raw = row[col_indices["tipooperacion"]].strip().lower()
            if "venta" in tx_type_raw:
                tx_type = "sell"
                quantity = abs(quantity)  # Ensure quantity is positive for sells
            elif "compra" in tx_type_raw:
                tx_type = "buy"
                quantity = abs(quantity)

        csv_reference = f"bull_{date}_{ticker}_{quantity}"

        items.append({
            "date": date,
            "tx_type": tx_type,
            "ticker": ticker,
            "quantity": quantity,
            "price": price,
            "broker": "bull_market",
            "csv_reference": csv_reference,
        })

    return items


def parse_csv(csv_bytes: bytes) -> Tuple[Optional[str], list[dict]]:
    """Auto-detect broker and parse CSV.

    Returns tuple of (broker_name, items_list) where:
    - broker_name: "cocos_capital", "invertir_online", "bull_market", or None
    - items_list: list of standardized transaction dicts

    If broker cannot be detected, returns (None, []).
    """
    broker = detect_broker(csv_bytes)

    if broker == "cocos_capital":
        items = parse_cocos_csv(csv_bytes)
    elif broker == "invertir_online":
        items = parse_invertir_online_csv(csv_bytes)
    elif broker == "bull_market":
        items = parse_bull_market_csv(csv_bytes)
    else:
        items = []

    return broker, items


def _detect_broker_from_rows(rows: list[list]) -> Optional[str]:
    """Auto-detect broker format from row headers.

    Returns one of: "cocos_capital", "invertir_online", "bull_market", or None.
    """
    if not rows:
        return None

    headers = _get_headers_lower(rows[0])

    if "especie" in headers and "comision" in headers:
        return "cocos_capital"

    if "isin" in headers and "liquidacion" in headers:
        return "invertir_online"

    if "simbolo" in headers:
        return "bull_market"

    return None


def _rows_to_transactions(rows: list[list], broker: str) -> list[dict]:
    """Convert Excel rows to standardized transactions for given broker.

    Args:
        rows: List of lists (first row is headers)
        broker: One of "cocos_capital", "invertir_online", "bull_market"

    Returns:
        List of standardized transaction dicts
    """
    if not rows or broker not in ("cocos_capital", "invertir_online", "bull_market"):
        return []

    headers = _get_headers_lower(rows[0])

    col_indices = {}
    for i, h in enumerate(headers):
        if "fecha" in h:
            col_indices["fecha"] = i
        elif "tipo" in h:
            col_indices["tipo"] = i
        elif "especie" in h:
            col_indices["especie"] = i
        elif "simbolo" in h:
            col_indices["simbolo"] = i
        elif "isin" in h:
            col_indices["isin"] = i
        elif "cantidad" in h:
            col_indices["cantidad"] = i
        elif "precio" in h:
            col_indices["precio"] = i

    required = {"fecha", "cantidad", "precio"}
    if broker == "cocos_capital":
        required.add("tipo")
        required.add("especie")
    elif broker == "invertir_online":
        required.add("especie")
    elif broker == "bull_market":
        required.add("simbolo")

    if not required.issubset(col_indices.keys()):
        return []

    items = []
    for row in rows[1:]:
        if len(row) <= max(col_indices.values()):
            continue

        date_val = row[col_indices["fecha"]]
        if isinstance(date_val, str):
            date = _parse_date(date_val)
        else:
            try:
                from datetime import datetime
                if isinstance(date_val, datetime):
                    date = date_val.strftime("%Y-%m-%d")
                else:
                    date = None
            except Exception:
                date = None

        if not date:
            continue

        if broker == "cocos_capital":
            tx_type_raw = str(row[col_indices["tipo"]]).strip()
            tx_type = "sell" if "venta" in tx_type_raw.lower() else "buy"
            ticker = str(row[col_indices["especie"]]).strip().upper()
        elif broker == "invertir_online":
            tx_type = "buy"
            ticker = str(row[col_indices["especie"]]).strip().upper()
        else:  # bull_market
            tx_type = "buy"
            ticker = str(row[col_indices["simbolo"]]).strip().upper()

        if not ticker:
            continue

        qty_val = row[col_indices["cantidad"]]
        quantity = _parse_amount(str(qty_val)) if not isinstance(qty_val, (int, float)) else float(qty_val)
        if quantity is None or quantity <= 0:
            continue

        price_val = row[col_indices["precio"]]
        price = _parse_amount(str(price_val)) if not isinstance(price_val, (int, float)) else float(price_val)
        if price is None or price <= 0:
            continue

        csv_reference = f"{broker}_{date}_{ticker}_{quantity}"

        items.append({
            "date": date,
            "tx_type": tx_type,
            "ticker": ticker,
            "quantity": quantity,
            "price": price,
            "broker": broker,
            "csv_reference": csv_reference,
        })

    return items


def parse_xlsx(xlsx_bytes: bytes) -> Tuple[Optional[str], list[dict]]:
    """Parse Excel file (.xlsx) for investment transactions.

    Auto-detects broker format from headers.
    Returns tuple of (broker_name, items_list).
    """
    if not OPENPYXL_AVAILABLE:
        return None, []

    try:
        from io import BytesIO
        wb = load_workbook(BytesIO(xlsx_bytes))
        ws = wb.active

        rows = []
        for row in ws.iter_rows(values_only=True):
            row_list = [str(cell) if cell is not None else "" for cell in row]
            rows.append(row_list)

        if not rows:
            return None, []

        broker = _detect_broker_from_rows(rows)
        if not broker:
            return None, []

        items = _rows_to_transactions(rows, broker)
        return broker, items

    except Exception:
        return None, []


def parse_file(file_bytes: bytes, filename: str) -> Tuple[Optional[str], list[dict]]:
    """Parse investment file (CSV or XLSX) by extension.

    Args:
        file_bytes: Raw file content
        filename: Original filename to detect format

    Returns:
        Tuple of (broker_name, items_list)
    """
    filename_lower = (filename or "").lower()

    if filename_lower.endswith(".xlsx"):
        return parse_xlsx(file_bytes)
    elif filename_lower.endswith(".csv"):
        return parse_csv(file_bytes)
    else:
        return None, []

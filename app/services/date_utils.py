"""Utilidades de fecha compartidas entre budget, insights y alert_engine."""
import calendar


def days_in_month(year: int, month: int) -> int:
    """Cantidad de días del mes dado. Usa calendar.monthrange (maneja
    diciembre→enero y años bisiestos sin ramas manuales)."""
    return calendar.monthrange(year, month)[1]

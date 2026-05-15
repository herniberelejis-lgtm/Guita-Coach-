# tests/test_gmail_income.py

INCOME_SUBJECTS = [
    "Recibiste $5.000 de Juan Perez",
    "Te acreditaron $12.300 en tu cuenta",
    "Transferencia recibida por $8.750",
    "Deposito recibido: $3.200",
    "Acreditacion de $15.000",
]

EXPENSE_SUBJECTS = [
    "Pagaste $1.500 en Rappi",
    "Tu pago de $3.000 fue procesado",
]

def test_income_subjects_detected():
    from app.services.gmail import _is_income_email
    for subj in INCOME_SUBJECTS:
        assert _is_income_email(subj) is True, f"Should detect income: {subj}"

def test_expense_subjects_not_income():
    from app.services.gmail import _is_income_email
    for subj in EXPENSE_SUBJECTS:
        assert _is_income_email(subj) is False, f"Should NOT detect income: {subj}"

def test_parse_income_amount():
    from app.services.gmail import _parse_amount
    assert _parse_amount("5.000") == 5000.0
    assert _parse_amount("12.300,50") == 12300.50

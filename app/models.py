from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)
    name = Column(String, default="Hernán")
    monthly_income = Column(Float, default=0.0)
    necesidades_pct = Column(Float, default=50.0)
    gustos_pct = Column(Float, default=30.0)
    ahorro_pct = Column(Float, default=20.0)
    payday = Column(Integer, default=1)
    onboarding_done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Connection(Base):
    __tablename__ = "connections"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    provider = Column(String)        # gmail | mercadopago
    status = Column(String, default="disconnected")  # connected | disconnected | error
    access_token = Column(Text)      # NOTE: cifrar en producción
    refresh_token = Column(Text)
    token_expiry = Column(DateTime)
    last_sync = Column(DateTime)
    sync_status = Column(String, default="idle")  # idle | syncing | error

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    source = Column(String)          # gmail | mercadopago | manual | demo
    provider = Column(String)        # nombre del emisor / fuente
    merchant = Column(String)
    amount = Column(Float)
    currency = Column(String, default="ARS")
    date = Column(String)            # YYYY-MM-DD
    month = Column(String)           # YYYY-MM
    category = Column(String)        # necesidades | gustos | ahorro
    subcategory = Column(String)
    status = Column(String, default="new")  # new | classified | reviewed
    confidence = Column(Float, default=0.0)
    rule_used = Column(String)
    ai_reason = Column(Text)
    raw_reference = Column(Text)
    needs_review = Column(Boolean, default=False)
    tx_type = Column(String, default="expense")   # "expense" | "income"
    is_internal_transfer = Column(Boolean, default=False)  # transferencia entre cuentas propias
    is_duplicate = Column(Boolean, default=False)          # duplicado de otra fuente
    is_reimbursement = Column(Boolean, default=False)      # devolución de gasto compartido
    reimburses_tx_id = Column(Integer, nullable=True)      # gasto al que devuelve
    created_at = Column(DateTime, default=datetime.utcnow)


class Goal(Base):
    """Meta de ahorro. parent_id permite submetas."""
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    parent_id = Column(Integer, nullable=True)   # meta padre (submetas)
    name = Column(String)
    target_amount = Column(Float, default=0.0)
    saved_amount = Column(Float, default=0.0)
    currency = Column(String, default="ARS")     # ARS | USD
    deadline = Column(String, nullable=True)     # YYYY-MM-DD
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecurringExpense(Base):
    """Gasto fijo mensual o compra en cuotas (installments_total > 0)."""
    __tablename__ = "recurring_expenses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    merchant = Column(String)
    amount = Column(Float)
    category = Column(String, default="necesidades")
    day_of_month = Column(Integer, default=1)
    installments_total = Column(Integer, default=0)  # 0 = gasto fijo sin fin
    installments_paid = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    last_applied_month = Column(String, nullable=True)  # YYYY-MM
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    token = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    type = Column(String)            # threshold | projection
    category = Column(String)        # necesidades | gustos | ahorro
    message = Column(Text)
    ai_advice = Column(Text)
    payload = Column(Text)           # JSON con datos de acción (ej: split sugerido)
    severity = Column(String)        # warning | critical
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class CategoryRule(Base):
    __tablename__ = "category_rules"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    pattern = Column(String)
    category = Column(String)
    subcategory = Column(String)
    priority = Column(Integer, default=0)
    from_correction = Column(Boolean, default=False)

from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, date

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
    income_is_variable = Column(Boolean, default=False)  # sin sueldo fijo: el presupuesto usa ingresos registrados
    onboarding_done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    investments = relationship("Investment", back_populates="user", cascade="all, delete-orphan")
    investment_transactions = relationship("InvestmentTransaction", back_populates="user", cascade="all, delete-orphan")

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
    payment_method = Column(String, default="")  # credito | debito | qr | transferencia | efectivo | otro
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


class Investment(Base):
    """Individual investment position (stock, ETF, bond, etc.)."""
    __tablename__ = "investment"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    broker = Column(String, nullable=False)  # "cocos_capital", "invertir_online", "bull_market", "manual", "crypto_*"
    ticker = Column(String, nullable=False)
    asset_type = Column(String, nullable=False, default="stock")  # "stock" | "crypto"
    currency = Column(String, nullable=False, default="ARS")  # moneda del avg_cost
    quantity = Column(Float, nullable=False, default=0)
    avg_cost = Column(Float, nullable=False, default=0)
    purchase_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="open")  # "open" or "closed"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="investments")
    transactions = relationship("InvestmentTransaction", back_populates="investment", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint('user_id', 'ticker', 'broker', name='uq_user_ticker_broker'),)


class InvestmentTransaction(Base):
    """Buy/sell transactions for investments."""
    __tablename__ = "investment_transaction"
    id = Column(Integer, primary_key=True)
    investment_id = Column(Integer, ForeignKey("investment.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    broker = Column(String, nullable=False)
    ticker = Column(String, nullable=False)
    asset_type = Column(String, nullable=False, default="stock")  # "stock" | "crypto"
    currency = Column(String, nullable=False, default="ARS")
    tx_type = Column(String, nullable=False)  # "buy" or "sell"
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    csv_reference = Column(String, nullable=True)
    linked_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    investment = relationship("Investment", back_populates="transactions")
    user = relationship("User", back_populates="investment_transactions")


class InvestmentPrice(Base):
    """Current market price for investment tickers."""
    __tablename__ = "investment_price"
    id = Column(Integer, primary_key=True)
    ticker = Column(String, unique=True, nullable=False)
    asset_type = Column(String, default="stock")  # "stock" | "crypto"
    price = Column(Float, nullable=False)
    currency = Column(String, default="ARS")
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

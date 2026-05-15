from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
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
    created_at = Column(DateTime, default=datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    type = Column(String)            # threshold | projection
    category = Column(String)        # necesidades | gustos | ahorro
    message = Column(Text)
    ai_advice = Column(Text)
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

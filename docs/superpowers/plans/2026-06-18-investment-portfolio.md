# Investment Portfolio Module - Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement tasks. Each task is bite-sized and self-contained.

**Goal:** Build a complete investment portfolio tracking system with CSV upload, automatic P&L calculation, and integration with existing fintech app (Phase B MVP).

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest

---

## Phase B: MVP Tasks

### Task 1: Add Investment Models to SQLAlchemy
- Modify: `app/models.py`
- Add: Investment, InvestmentTransaction, InvestmentPrice classes
- Update User model with relationships

### Task 2: Initialize Database Tables
- Verify init_db creates new tables automatically

### Task 3: Create CSV Parser Service
- Create: `app/services/investment_parser.py`
- Support: Cocos Capital, Invertir Online, Bull Market
- Auto-detect broker format

### Task 4: Create P&L Calculator
- Create: `app/services/investment_calculator.py`
- Weighted average cost calculation
- P&L calculations (realized + unrealized)

### Task 5: Create Investment API Endpoints
- Create: `app/routers/investments.py`
- Endpoints: /upload, /holdings, /history, /summary, /price
- Include router in main.py

### Task 6: Dashboard Integration
- Add investment summary to dashboard
- Summary widget showing P&L

---

## Full Specification

See `docs/superpowers/specs/2026-06-18-investment-portfolio-design.md` for complete specification.

def test_seed_includes_income_transactions():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models import Base, Transaction, User
    from app.services.seed import seed_demo_data

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    # Add required user first
    db.add(User(id=1, monthly_income=1300000, name="Test", onboarding_done=True))
    db.commit()

    seed_demo_data(db)

    incomes = db.query(Transaction).filter_by(tx_type="income").all()
    assert len(incomes) >= 1
    assert all(t.category == "ingreso" for t in incomes)

    expenses = db.query(Transaction).filter_by(tx_type="expense").all()
    assert len(expenses) >= 5

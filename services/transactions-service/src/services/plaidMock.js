/** Mock de Plaid para testing local sin credenciales reales. */

const MERCHANTS = [{
  name: "Supermercado Carrefour",
  category: "FOOD_AND_DRINK",
  amount: 3450.0
}, {
  name: "Farmacia del Dr. Surtidor",
  category: "HEALTHCARE",
  amount: 890.5
}, {
  name: "Pago Netflix",
  category: "ENTERTAINMENT",
  amount: 299.99
}, {
  name: "Spotify Premium",
  category: "ENTERTAINMENT",
  amount: 199.99
}, {
  name: "Librería El Ateneo",
  category: "SHOPPING",
  amount: 1230.0
}, {
  name: "Uber Eats",
  category: "FOOD_AND_DRINK",
  amount: 645.0
}, {
  name: "YPF Estación Servicio",
  category: "TRANSPORTATION",
  amount: 2500.0
}, {
  name: "Edesur - Factura",
  category: "UTILITIES",
  amount: 1850.0
}, {
  name: "Movistar - Teléfono",
  category: "UTILITIES",
  amount: 899.99
}, {
  name: "Aerolíneas Argentinas",
  category: "TRANSPORTATION",
  amount: 8900.0
}, {
  name: "Gym Smart Fit",
  category: "FITNESS",
  amount: 599.99
}, {
  name: "Amazon.com.ar",
  category: "SHOPPING",
  amount: 4230.0
}, {
  name: "Rappi Delivery",
  category: "FOOD_AND_DRINK",
  amount: 320.5
}, {
  name: "Cine Hoyts",
  category: "ENTERTAINMENT",
  amount: 890.0
}, {
  name: "Barbería Premium",
  category: "PERSONAL_CARE",
  amount: 450.0
}, {
  name: "Transferencia Salario",
  category: "INCOME",
  amount: -35000.0
}, {
  name: "Depósito Freelance",
  category: "INCOME",
  amount: -8500.0
}];
class PlaidMockClient {
  async createLinkToken(userId, _userEmail) {
    return `link_test_${userId}_${Date.now()}`;
  }
  async exchangeToken(publicToken) {
    if (!publicToken.startsWith("public_")) return `access_test_${publicToken}_${Date.now()}`;
    return `access_mock_${Date.now()}`;
  }
  async getAccounts(_accessToken) {
    return [{
      account_id: "acc_checking_001",
      name: "Cuenta Corriente",
      type: "depository",
      subtype: "checking",
      mask: "4682",
      official_name: "Cuenta Corriente en Pesos",
      balance: 45230.5,
      currency: "ARS",
      institution: "Platypus Bank"
    }, {
      account_id: "acc_savings_001",
      name: "Caja de Ahorro",
      type: "depository",
      subtype: "savings",
      mask: "7891",
      official_name: "Caja de Ahorro en Pesos",
      balance: 128500.75,
      currency: "ARS",
      institution: "Platypus Bank"
    }, {
      account_id: "acc_credit_001",
      name: "Tarjeta de Crédito",
      type: "credit",
      subtype: "credit card",
      mask: "5432",
      official_name: "Visa Platypus",
      balance: -2340.0,
      currency: "ARS",
      institution: "Platypus Bank"
    }];
  }
  async getTransactions(_accessToken, days = 30) {
    const now = Date.now();
    const transactions = [];
    for (let i = 0; i < 25; i++) {
      const daysAgo = Math.floor(Math.random() * (days + 1));
      const txDate = new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
      const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
      transactions.push({
        transaction_id: `txn_mock_${i}_${txDate}`,
        account_id: "acc_checking_001",
        amount: merchant.amount,
        date: txDate,
        name: merchant.name,
        merchant_name: merchant.name,
        personal_finance_category: {
          primary: merchant.category,
          detailed: merchant.category
        },
        pending: false,
        iso_currency_code: "ARS",
        unofficial_currency_code: "ARS"
      });
    }
    transactions.sort((a, b) => a.date < b.date ? 1 : -1);
    return transactions;
  }
}
export const plaidMockClient = new PlaidMockClient();

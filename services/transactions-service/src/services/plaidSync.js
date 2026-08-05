/** Cliente HTTP para Plaid API — con mock automático si las credenciales son de test. */
import { settings } from "@guita-coach/shared";
import { plaidMockClient } from "./plaidMock.js";
class PlaidClient {
  constructor() {
    this.useMock = settings.plaidClientId.startsWith("test_") || settings.plaidSecret.startsWith("test_");
    this.baseUrl = settings.plaidEnv === "sandbox" ? "https://sandbox.plaid.com" : "https://production.plaid.com";
    if (!settings.plaidClientId || !settings.plaidSecret) {
      throw new Error("PLAID_CLIENT_ID y PLAID_SECRET requeridos en .env");
    }
  }
  async createLinkToken(userId, userEmail) {
    if (this.useMock) return plaidMockClient.createLinkToken(userId, userEmail);
    try {
      const r = await fetch(`${this.baseUrl}/link/token/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_id: settings.plaidClientId,
          secret: settings.plaidSecret,
          user: {
            client_user_id: String(userId)
          },
          client_name: "Guita Coach",
          user_email_address: userEmail,
          country_codes: ["AR"],
          language: "es",
          products: ["auth", "transactions"]
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.link_token || null;
    } catch {
      return null;
    }
  }
  async exchangeToken(publicToken) {
    if (this.useMock) return plaidMockClient.exchangeToken(publicToken);
    try {
      const r = await fetch(`${this.baseUrl}/item/public_token/exchange`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_id: settings.plaidClientId,
          secret: settings.plaidSecret,
          public_token: publicToken
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.access_token || null;
    } catch {
      return null;
    }
  }
  async getTransactions(accessToken, days = 30) {
    if (this.useMock) return plaidMockClient.getTransactions(accessToken, days);
    try {
      const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const endDate = new Date().toISOString().slice(0, 10);
      const r = await fetch(`${this.baseUrl}/transactions/get`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_id: settings.plaidClientId,
          secret: settings.plaidSecret,
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: {
            count: 250,
            offset: 0
          }
        })
      });
      if (!r.ok) return [];
      const data = await r.json();
      return data.transactions || [];
    } catch {
      return [];
    }
  }
  async getAccounts(accessToken) {
    if (this.useMock) return plaidMockClient.getAccounts(accessToken);
    try {
      const r = await fetch(`${this.baseUrl}/accounts/get`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_id: settings.plaidClientId,
          secret: settings.plaidSecret,
          access_token: accessToken
        })
      });
      if (!r.ok) return [];
      const data = await r.json();
      return data.accounts || [];
    } catch {
      return [];
    }
  }
}
let instance = null;
function getClient() {
  if (!instance) instance = new PlaidClient();
  return instance;
}
export const plaidClient = {
  createLinkToken: (userId, userEmail) => getClient().createLinkToken(userId, userEmail),
  exchangeToken: publicToken => getClient().exchangeToken(publicToken),
  getTransactions: (accessToken, days = 30) => getClient().getTransactions(accessToken, days),
  getAccounts: accessToken => getClient().getAccounts(accessToken)
};

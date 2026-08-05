/** Prometeo API Client — Open Banking para Argentina. Docs: docs.prometeoapi.com */
import { settings } from "@guita-coach/shared";
const SANDBOX_URL = "https://banking.sandbox.prometeoapi.net";
const PRODUCTION_URL = "https://banking.prometeoapi.net";
class PrometeoClient {
  constructor() {
    this.baseUrl = settings.prometeoEnv === "sandbox" ? SANDBOX_URL : PRODUCTION_URL;
    if (!settings.prometeoApiKey) throw new Error("PROMETEO_API_KEY requerido en .env");
  }
  headers() {
    return {
      "X-API-Key": settings.prometeoApiKey,
      "content-type": "application/json"
    };
  }
  async listProviders() {
    try {
      const r = await fetch(`${this.baseUrl}/provider/`, {
        headers: this.headers()
      });
      if (!r.ok) return [];
      const data = await r.json();
      const providers = Array.isArray(data) ? data : data.providers || [];
      return providers.filter(p => p && typeof p === "object").map(p => ({
        code: p.code || p.name,
        name: p.name || p.code || "Unknown"
      }));
    } catch {
      return [];
    }
  }
  async login(provider, username, password, docType = "C") {
    try {
      const r = await fetch(`${this.baseUrl}/login/`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          provider,
          username,
          password,
          type: docType
        })
      });
      if (!r.ok) return {
        status: "error",
        message: `Error ${r.status}`
      };
      const data = await r.json();
      return {
        session_key: data.key,
        status: data.status,
        message: data.message || ""
      };
    } catch (e) {
      return {
        status: "error",
        message: String(e)
      };
    }
  }
  async getAccounts(sessionKey) {
    try {
      const url = new URL(`${this.baseUrl}/account/`);
      url.searchParams.set("key", sessionKey);
      const r = await fetch(url, {
        headers: this.headers()
      });
      if (!r.ok) return [];
      const data = await r.json();
      const accounts = Array.isArray(data) ? data : data.accounts || [];
      return accounts.map(acc => ({
        account_id: acc.id || acc.number,
        name: acc.name || "Cuenta",
        number: acc.number || "",
        currency: acc.currency || "ARS",
        balance: Number(acc.balance || 0),
        type: acc.type || ""
      }));
    } catch {
      return [];
    }
  }
  async getMovements(sessionKey, accountNumber, currency = "ARS", days = 90) {
    const start = fmtDate(new Date(Date.now() - days * 86400000));
    const end = fmtDate(new Date());
    try {
      const url = new URL(`${this.baseUrl}/movement/`);
      url.search = new URLSearchParams({
        key: sessionKey,
        account_number: accountNumber,
        currency,
        date_start: start,
        date_end: end
      }).toString();
      const r = await fetch(url, {
        headers: this.headers()
      });
      if (!r.ok) return [];
      const data = await r.json();
      const movements = Array.isArray(data) ? data : data.movements || [];
      return movements.map(mov => {
        let amount = Number(mov.debit || 0) - Number(mov.credit || 0);
        if (amount === 0) amount = Number(mov.amount || 0);
        const dateRaw = String(mov.date || "");
        let dateIso;
        if (dateRaw.includes("/")) {
          const [d, m, y] = dateRaw.split("/");
          dateIso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        } else {
          dateIso = dateRaw.slice(0, 10) || new Date().toISOString().slice(0, 10);
        }
        return {
          transaction_id: mov.id || `prom_${accountNumber}_${dateIso}_${amount}`,
          account_id: accountNumber,
          amount,
          date: dateIso,
          name: mov.description || "Transacción",
          merchant_name: mov.description || "",
          personal_finance_category: {
            primary: "OTHER",
            detailed: "OTHER"
          },
          pending: false,
          iso_currency_code: currency
        };
      });
    } catch {
      return [];
    }
  }
}
function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
let instance = null;
export function getPrometeoClient() {
  if (!instance && settings.prometeoApiKey) {
    try {
      instance = new PrometeoClient();
    } catch {
      return null;
    }
  }
  return instance;
}

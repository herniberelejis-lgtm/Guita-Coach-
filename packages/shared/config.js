import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Todos los microservicios comparten un único .env en la raíz del monorepo,
// sin importar desde qué carpeta arranquen (npm workspaces cambia el cwd).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function bool(v, fallback = false) {
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
function normalizeAppUrl(v) {
  return v.trim().replace(/\/+$/, "");
}
export const settings = {
  secretKey: process.env.SECRET_KEY || "dev-secret-key-change-in-production",
  claudeApiKey: process.env.CLAUDE_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  aiProvider: process.env.AI_PROVIDER || "gemini",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  mpClientId: process.env.MP_CLIENT_ID || "",
  mpClientSecret: process.env.MP_CLIENT_SECRET || "",
  plaidClientId: process.env.PLAID_CLIENT_ID || "",
  plaidSecret: process.env.PLAID_SECRET || "",
  plaidEnv: process.env.PLAID_ENV || "sandbox",
  prometeoApiKey: process.env.PROMETEO_API_KEY || "",
  prometeoEnv: process.env.PROMETEO_ENV || "sandbox",
  appUrl: normalizeAppUrl(process.env.APP_URL || "http://localhost:8000"),
  demoMode: bool(process.env.DEMO_MODE, false),
  livePrices: bool(process.env.LIVE_PRICES, true),
  databaseUrl: process.env.DATABASE_URL || "",

  // ── Microservicios: puertos propios + URLs para que el gateway proxee ──────
  gatewayPort: parseInt(process.env.GATEWAY_PORT || "8000", 10),
  authServicePort: parseInt(process.env.AUTH_SERVICE_PORT || "4001", 10),
  transactionsServicePort: parseInt(process.env.TRANSACTIONS_SERVICE_PORT || "4002", 10),
  budgetServicePort: parseInt(process.env.BUDGET_SERVICE_PORT || "4003", 10),
  investmentsServicePort: parseInt(process.env.INVESTMENTS_SERVICE_PORT || "4004", 10),
  aiServicePort: parseInt(process.env.AI_SERVICE_PORT || "4005", 10),

  authServiceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  transactionsServiceUrl: process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4002",
  budgetServiceUrl: process.env.BUDGET_SERVICE_URL || "http://localhost:4003",
  investmentsServiceUrl: process.env.INVESTMENTS_SERVICE_URL || "http://localhost:4004",
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:4005",
  get claudeEnabled() {
    return Boolean(this.claudeApiKey);
  },
  get geminiEnabled() {
    return Boolean(this.geminiApiKey);
  },
  get gmailEnabled() {
    return Boolean(this.googleClientId && this.googleClientSecret);
  },
  get mpEnabled() {
    return Boolean(this.mpClientId && this.mpClientSecret);
  },
  get plaidEnabled() {
    return Boolean(this.plaidClientId && this.plaidSecret);
  },
  get prometeoEnabled() {
    return Boolean(this.prometeoApiKey);
  },
  get aiEnabled() {
    return this.aiProvider === "claude" ? this.claudeEnabled : this.geminiEnabled;
  },
  get secretKeyIsDefault() {
    return this.secretKey === "dev-secret-key-change-in-production";
  }
};

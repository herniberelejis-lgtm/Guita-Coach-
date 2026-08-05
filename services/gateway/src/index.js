/** Gateway — único punto de entrada público. Hace proxy a cada microservicio
 * según el prefijo de la ruta y sirve el build estático de React.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { settings } from "@guita-coach/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable("x-powered-by");

const ROUTES = [
  ["/api/auth", settings.authServiceUrl],
  ["/api/transactions", settings.transactionsServiceUrl],
  ["/api/sync", settings.transactionsServiceUrl],
  ["/api/budget", settings.budgetServiceUrl],
  ["/api/insights", settings.budgetServiceUrl],
  ["/api/goals", settings.budgetServiceUrl],
  ["/api/investments", settings.investmentsServiceUrl],
  ["/api/chat", settings.aiServiceUrl],
  ["/api/advisor", settings.aiServiceUrl],
  ["/api/academy", settings.aiServiceUrl],
];
// app.use(prefix, ...) haría que Express recorte el prefijo del req.url antes
// de llegar al proxy; usamos pathFilter para conservar la URL completa tal
// cual la espera cada microservicio.
for (const [prefix, target] of ROUTES) {
  app.use(createProxyMiddleware({ target, changeOrigin: true, pathFilter: prefix }));
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

// ─── Frontend estático (build de Vite) ──────────────────────────────────────
const clientDist = path.resolve(__dirname, "../../../client/dist");
app.use(express.static(clientDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(200).json({ status: "Guita Coach Gateway" });
  });
});

app.listen(settings.gatewayPort, () => {
  console.log(`Gateway escuchando en el puerto ${settings.gatewayPort}`);
  for (const [prefix, target] of ROUTES) {
    console.log(`  ${prefix.padEnd(18)} -> ${target}`);
  }
});

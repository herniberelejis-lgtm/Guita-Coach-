/** transactions-service — CRUD de transacciones + sincronización (Gmail, MP, Plaid, Prometeo, CSV). */
import { createServiceApp, attachErrorHandler, settings } from "@guita-coach/shared";
import { transactionsRouter } from "./routes/transactions.js";
import { syncRouter } from "./routes/sync.js";

const app = createServiceApp();
app.use("/api/transactions", transactionsRouter);
app.use("/api/sync", syncRouter);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "transactions-service" }));
attachErrorHandler(app);

app.listen(settings.transactionsServicePort, () => {
  console.log(`transactions-service escuchando en el puerto ${settings.transactionsServicePort}`);
});

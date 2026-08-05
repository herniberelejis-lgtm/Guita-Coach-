/** budget-service — presupuesto/onboarding, insights del mes y metas/gastos fijos. */
import { createServiceApp, attachErrorHandler, settings } from "@guita-coach/shared";
import { budgetRouter } from "./routes/budget.js";
import { insightsRouter } from "./routes/insights.js";
import { goalsRouter } from "./routes/goals.js";

const app = createServiceApp();
app.use("/api/budget", budgetRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/goals", goalsRouter);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "budget-service" }));
attachErrorHandler(app);

app.listen(settings.budgetServicePort, () => {
  console.log(`budget-service escuchando en el puerto ${settings.budgetServicePort}`);
});

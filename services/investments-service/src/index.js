/** investments-service — cartera de inversiones, holdings, analítica de riesgo y precios en vivo. */
import { createServiceApp, attachErrorHandler, settings } from "@guita-coach/shared";
import { investmentsRouter } from "./routes/investments.js";

const app = createServiceApp();
app.use("/api/investments", investmentsRouter);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "investments-service" }));
attachErrorHandler(app);

app.listen(settings.investmentsServicePort, () => {
  console.log(`investments-service escuchando en el puerto ${settings.investmentsServicePort}`);
});

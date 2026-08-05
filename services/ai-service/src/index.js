/** ai-service — chat con IA, consejos financieros y Guita Coach Academy. */
import { createServiceApp, attachErrorHandler, settings } from "@guita-coach/shared";
import { chatRouter } from "./routes/chat.js";
import { advisorRouter } from "./routes/advisor.js";
import { academyRouter } from "./routes/academy.js";

const app = createServiceApp();
app.use("/api/chat", chatRouter);
app.use("/api/advisor", advisorRouter);
app.use("/api/academy", academyRouter);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "ai-service" }));
attachErrorHandler(app);

app.listen(settings.aiServicePort, () => {
  console.log(`ai-service escuchando en el puerto ${settings.aiServicePort}`);
});

/** auth-service — registro/login/sesiones + OAuth (Google, Gmail, Mercado Pago). */
import { createServiceApp, attachErrorHandler, settings } from "@guita-coach/shared";
import { authRouter } from "./routes/auth.js";

const app = createServiceApp();
app.use("/api/auth", authRouter);
app.get("/health", (_req, res) => res.json({ status: "ok", service: "auth-service" }));
attachErrorHandler(app);

if (settings.secretKeyIsDefault) {
  console.warn(
    "SECRET_KEY sigue en su valor por defecto — usado para cifrar tokens OAuth en reposo. " +
      "Generá uno propio y seteá SECRET_KEY antes de manejar datos reales."
  );
}

app.listen(settings.authServicePort, () => {
  console.log(`auth-service escuchando en el puerto ${settings.authServicePort}`);
});

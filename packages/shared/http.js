import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function ah(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Middleware de error uniforme para todos los microservicios. */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }
  if (err && typeof err === "object" && "issues" in err) {
    res.status(400).json({ detail: "Datos inválidos", issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ detail: "Error interno del servidor" });
}

/**
 * Crea una app Express con el boilerplate común a todos los microservicios:
 * compresión, CORS con credenciales, cookies y body JSON. Cada servicio monta
 * sus propios routers y llama a `attachErrorHandler(app)` al final.
 */
export function createServiceApp({ jsonLimit = "2mb" } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(compression());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: jsonLimit }));
  return app;
}

export function attachErrorHandler(app) {
  app.use(errorHandler);
}

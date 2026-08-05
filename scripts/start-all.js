/**
 * Arranca los 6 microservicios (5 servicios + gateway) como procesos separados
 * dentro de un mismo contenedor. Pensado para plataformas PaaS que solo
 * soportan un contenedor por deploy (Railway/Render hobby, etc.).
 *
 * Para un despliegue de microservicios "real" (un contenedor por servicio,
 * escalables de forma independiente) usar docker-compose.yml en su lugar.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SERVICES = [
  "services/auth-service",
  "services/transactions-service",
  "services/budget-service",
  "services/investments-service",
  "services/ai-service",
  "services/gateway",
];

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 2000).unref();
}

for (const dir of SERVICES) {
  const name = dir.split("/").pop();
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: path.join(root, dir),
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => {
    console.error(`[start-all] ${name} terminó con código ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

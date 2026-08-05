import { getCurrentUser } from "../security.js";
export async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      detail: "No autenticado"
    });
    return;
  }
  req.user = user;
  next();
}
export async function optionalAuth(req, _res, next) {
  const user = await getCurrentUser(req);
  if (user) req.user = user;
  next();
}

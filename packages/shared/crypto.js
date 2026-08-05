/** Cifrado en reposo para tokens OAuth (Connection.accessToken / refreshToken).
 * AES-256-GCM con clave derivada de SECRET_KEY. decrypt() hace fallback a texto
 * plano si el valor no tiene el formato esperado.
 */
import crypto from "node:crypto";
import { settings } from "./config.js";
function key() {
  return crypto.createHash("sha256").update(settings.secretKey).digest();
}
export function encrypt(value) {
  if (!value) return value ?? null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm$${iv.toString("base64")}$${tag.toString("base64")}$${enc.toString("base64")}`;
}
export function decrypt(value) {
  if (!value) return value ?? null;
  if (!value.startsWith("gcm$")) return value; // valor legado / no cifrado
  try {
    const [, ivB64, tagB64, dataB64] = value.split("$");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return value;
  }
}

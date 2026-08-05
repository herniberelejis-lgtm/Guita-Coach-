import crypto from "node:crypto";
import { prisma } from "@guita-coach/db";
import { settings } from "./config.js";
const PBKDF2_ITERATIONS = 200_000;
export const SESSION_COOKIE = "gc_session";
const SESSION_DAYS = 30;
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${digest}`;
}
export function verifyPassword(password, stored) {
  if (!stored) return false;
  try {
    const [, itersStr, salt, digest] = stored.split("$");
    const iters = parseInt(itersStr, 10);
    const computed = crypto.pbkdf2Sync(password, salt, iters, 32, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(digest));
  } catch {
    return false;
  }
}
function cookieIsSecure() {
  return settings.appUrl.startsWith("https://");
}
export async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await prisma.userSession.create({
    data: {
      userId,
      token,
      expiresAt
    }
  });
  res.cookie(SESSION_COOKIE, token, {
    maxAge: SESSION_DAYS * 86400 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure()
  });
  return token;
}
export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await prisma.userSession.deleteMany({
      where: {
        token
      }
    });
  }
  res.clearCookie(SESSION_COOKIE);
}
export function setOAuthStateCookie(res, state) {
  res.cookie("oauth_state", state, {
    maxAge: 600 * 1000,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure()
  });
}
export function checkOAuthState(req, state) {
  const cookieState = req.cookies?.oauth_state;
  return Boolean(cookieState) && cookieState === state;
}
export async function sessionUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: {
      token
    }
  });
  if (!session) return null;
  if (session.expiresAt && session.expiresAt < new Date()) return null;
  return prisma.user.findUnique({
    where: {
      id: session.userId
    }
  });
}
export async function getCurrentUser(req) {
  const user = await sessionUser(req);
  if (user) return user;
  if (settings.demoMode) {
    const demoUser = await prisma.user.findUnique({
      where: {
        id: 1
      }
    });
    if (demoUser) return demoUser;
  }
  return null;
}

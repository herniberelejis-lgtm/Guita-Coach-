/** Auth: registro/login con sesiones + OAuth flows para Google, Gmail y Mercado Pago. */
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import {
  settings,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  setOAuthStateCookie,
  checkOAuthState,
  requireAuth,
  ah,
  HttpError,
  encrypt,
  gmailSvc,
  mpSvc,
} from "@guita-coach/shared";
export const authRouter = Router();
const RegisterSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128)
});
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});
authRouter.post("/register", ah(async (req, res) => {
  const payload = RegisterSchema.parse(req.body);
  const email = payload.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({
    where: {
      email
    }
  });
  if (existing) throw new HttpError(409, "Ya existe una cuenta con ese email");
  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email,
      passwordHash: hashPassword(payload.password),
      onboardingDone: false
    }
  });
  await prisma.connection.createMany({
    data: [{
      userId: user.id,
      provider: "gmail"
    }, {
      userId: user.id,
      provider: "mercadopago"
    }]
  });
  await createSession(user.id, res);
  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
}));
authRouter.post("/login", ah(async (req, res) => {
  const payload = LoginSchema.parse(req.body);
  const email = payload.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: {
      email
    }
  });
  if (!user || !verifyPassword(payload.password, user.passwordHash)) {
    throw new HttpError(401, "Email o contraseña incorrectos");
  }
  await createSession(user.id, res);
  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
}));
authRouter.post("/logout", ah(async (req, res) => {
  await destroySession(req, res);
  res.json({
    ok: true
  });
}));
authRouter.get("/me", requireAuth, ah(async (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    onboarding_done: user.onboardingDone
  });
}));
authRouter.get("/providers", ah(async (_req, res) => {
  res.json({
    google: settings.gmailEnabled,
    mercadopago: settings.mpEnabled,
    bank: false
  });
}));
function loginState(res) {
  const state = crypto.randomBytes(16).toString("base64url");
  setOAuthStateCookie(res, state);
  return state;
}
function checkLoginState(req, state) {
  if (!checkOAuthState(req, state)) throw new HttpError(400, "Estado OAuth inválido");
}
async function findOrCreateUser(email, name) {
  const e = email.toLowerCase().trim();
  let user = await prisma.user.findUnique({
    where: {
      email: e
    }
  });
  if (user) return user;
  user = await prisma.user.create({
    data: {
      name: name || e.split("@")[0],
      email: e,
      onboardingDone: false
    }
  });
  await prisma.connection.createMany({
    data: [{
      userId: user.id,
      provider: "gmail"
    }, {
      userId: user.id,
      provider: "mercadopago"
    }]
  });
  return user;
}
async function saveTokens(userId, provider, tokens) {
  const data = {
    status: "connected",
    accessToken: encrypt(tokens.access_token),
    refreshToken: encrypt(tokens.refresh_token),
    lastSync: new Date()
  };
  const existing = await prisma.connection.findFirst({
    where: {
      userId,
      provider
    }
  });
  if (existing) {
    await prisma.connection.update({
      where: {
        id: existing.id
      },
      data
    });
  } else {
    await prisma.connection.create({
      data: {
        userId,
        provider,
        ...data
      }
    });
  }
}

// ─── Login social (Google) ──────────────────────────────────────────────────
authRouter.get("/google/login", ah(async (_req, res) => {
  if (!settings.gmailEnabled) {
    throw new HttpError(400, "Login con Google no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env");
  }
  const state = loginState(res);
  const params = new URLSearchParams({
    client_id: settings.googleClientId,
    redirect_uri: `${settings.appUrl}/api/auth/google/login/callback`,
    response_type: "code",
    scope: "openid email profile",
    state
  });
  res.redirect(307, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}));
authRouter.get("/google/login/callback", ah(async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  checkLoginState(req, state);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      redirect_uri: `${settings.appUrl}/api/auth/google/login/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) throw new HttpError(502, "Google no aceptó el código de autorización");
  const tokenData = await tokenRes.json();
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });
  if (!infoRes.ok) throw new HttpError(502, "No se pudo leer el perfil de Google");
  const profile = await infoRes.json();
  if (!profile.email) throw new HttpError(400, "Google no devolvió un email");
  const user = await findOrCreateUser(profile.email, profile.name || "");
  await createSession(user.id, res);
  res.redirect("/");
}));

// ─── Login social (Mercado Pago) ────────────────────────────────────────────
authRouter.get("/mp/login", ah(async (_req, res) => {
  if (!settings.mpEnabled) {
    throw new HttpError(400, "Login con Mercado Pago no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env");
  }
  const state = loginState(res);
  const params = new URLSearchParams({
    client_id: settings.mpClientId,
    redirect_uri: `${settings.appUrl}/api/auth/mp/login/callback`,
    response_type: "code",
    platform_id: "mp",
    state
  });
  res.redirect(307, `https://auth.mercadopago.com/authorization?${params}`);
}));
authRouter.get("/mp/login/callback", ah(async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  checkLoginState(req, state);
  const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.mpClientId,
      client_secret: settings.mpClientSecret,
      code,
      redirect_uri: `${settings.appUrl}/api/auth/mp/login/callback`
    })
  });
  if (!tokenRes.ok) throw new HttpError(502, "Mercado Pago no aceptó el código de autorización");
  const tokens = await tokenRes.json();
  const infoRes = await fetch("https://api.mercadopago.com/users/me", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`
    }
  });
  if (!infoRes.ok) throw new HttpError(502, "No se pudo leer el perfil de Mercado Pago");
  const profile = await infoRes.json();
  const email = profile.email || `mp_${profile.id}@mp.local`;
  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  const user = await findOrCreateUser(email, name);
  await saveTokens(user.id, "mercadopago", tokens);
  await createSession(user.id, res);
  res.redirect("/");
}));

// ─── Conexiones (Gmail / Mercado Pago) ─────────────────────────────────────
authRouter.get("/gmail", requireAuth, ah(async (_req, res) => {
  if (!settings.gmailEnabled) {
    throw new HttpError(400, "Gmail OAuth no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env");
  }
  const state = loginState(res);
  res.redirect(307, gmailSvc.getOauthUrl(state));
}));
authRouter.get("/gmail/callback", requireAuth, ah(async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  checkLoginState(req, state);
  const tokens = await gmailSvc.exchangeCode(code);
  await saveTokens(req.user.id, "gmail", tokens);
  res.clearCookie("oauth_state");
  res.redirect("/#settings?gmail=ok");
}));
authRouter.get("/mp", requireAuth, ah(async (_req, res) => {
  if (!settings.mpEnabled) {
    throw new HttpError(400, "Mercado Pago OAuth no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env");
  }
  const state = loginState(res);
  res.redirect(307, mpSvc.getOauthUrl(state));
}));
authRouter.get("/mp/callback", requireAuth, ah(async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  checkLoginState(req, state);
  const tokens = await mpSvc.exchangeCode(code);
  await saveTokens(req.user.id, "mercadopago", tokens);
  res.clearCookie("oauth_state");
  res.redirect("/#settings?mp=ok");
}));
authRouter.post("/disconnect/:provider", requireAuth, ah(async (req, res) => {
  const conn = await prisma.connection.findFirst({
    where: {
      userId: req.user.id,
      provider: req.params.provider
    }
  });
  if (!conn) throw new HttpError(404, "Conexión no encontrada");
  await prisma.connection.update({
    where: {
      id: conn.id
    },
    data: {
      status: "disconnected",
      accessToken: null,
      refreshToken: null
    }
  });
  res.json({
    ok: true
  });
}));

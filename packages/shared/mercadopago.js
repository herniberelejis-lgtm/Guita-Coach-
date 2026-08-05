/** Mercado Pago OAuth + lectura de movimientos. */
import { settings } from "./config.js";
import { fromMp } from "./paymentMethod.js";
export function getOauthUrl(state) {
  const params = new URLSearchParams({
    client_id: settings.mpClientId,
    redirect_uri: `${settings.appUrl}/api/auth/mp/callback`,
    response_type: "code",
    platform_id: "mp",
    state
  });
  return `https://auth.mercadopago.com/authorization?${params}`;
}
export async function exchangeCode(code) {
  const r = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.mpClientId,
      client_secret: settings.mpClientSecret,
      code,
      redirect_uri: `${settings.appUrl}/api/auth/mp/callback`
    })
  });
  if (!r.ok) throw new Error(`MP token error ${r.status}`);
  return r.json();
}
export async function fetchMovements(accessToken, daysBack = 180) {
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };
  const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10) + "T00:00:00.000-00:00";
  const until = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T00:00:00.000-00:00";
  const results = [];
  const meResp = await fetch("https://api.mercadopago.com/users/me", {
    headers
  });
  if (!meResp.ok) throw new Error(`MP users/me error ${meResp.status}: ${await meResp.text()}`);
  const me = await meResp.json();
  const myId = String(me.id || "");
  let offset = 0;
  while (true) {
    const url = new URL("https://api.mercadopago.com/v1/payments/search");
    url.search = new URLSearchParams({
      sort: "date_approved",
      criteria: "desc",
      range: "date_approved",
      begin_date: since,
      end_date: until,
      limit: "50",
      offset: String(offset)
    }).toString();
    const resp = await fetch(url, {
      headers
    });
    if (![200, 201].includes(resp.status)) throw new Error(`MP payments API error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const items = data.results || [];
    if (!items.length) break;
    for (const item of items) {
      if (item.status !== "approved") continue;
      const rawDate = String(item.date_approved || "").slice(0, 10);
      if (!rawDate) continue;
      const collectorId = String(item.collector_id ?? item.collector?.id ?? "");
      const payer = item.payer || {};
      const isIncome = Boolean(myId) && collectorId === myId;
      const description = String(item.description || "").trim();
      const paymentTypeId = item.payment_type_id;
      const isTransfer = paymentTypeId === "money_transfer";
      const paymentMethod = fromMp(paymentTypeId, item.payment_method_id);
      let merchant;
      let needsReview;
      if (isIncome) {
        merchant = description || payer.email || "Transferencia recibida";
        needsReview = isTransfer && !description;
      } else {
        merchant = description || item.payment_method_id || "";
        needsReview = false;
      }
      results.push({
        id: `mp_${item.id}`,
        source: "mercadopago",
        tx_type: isIncome ? "income" : "expense",
        amount: Number(item.transaction_amount || 0),
        currency: item.currency_id || "ARS",
        date: rawDate,
        month: rawDate.slice(0, 7),
        merchant,
        provider: "MercadoPago",
        payment_method: paymentMethod,
        needs_review: needsReview,
        raw_reference: String(item.id)
      });
    }
    const total = data.paging?.total || 0;
    offset += 50;
    if (offset >= total) break;
  }
  return results;
}
export async function refreshToken(token) {
  const r = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_secret: settings.mpClientSecret,
      refresh_token: token
    })
  });
  if (!r.ok) throw new Error(`MP refresh error ${r.status}`);
  return r.json();
}

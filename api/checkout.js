// AURELI checkout (Vercel serverless function, Node.js).
//
//   POST /api/checkout                 -> creates a Square payment page for the bag, returns { url }
//   GET  /api/checkout?market=US       -> what the customer will actually be charged per unit
//   GET  /api/checkout?check=1         -> setup self-check (never shows your token)
//
// Set these in Vercel > Project > Settings > Environment Variables, then redeploy:
//   SQUARE_ACCESS_TOKEN   Production access token (developer.squareup.com > your app > Credentials)
//   SQUARE_LOCATION_ID    developer.squareup.com > your app > Locations
//   SQUARE_CURRENCY       GBP for a UK Square account (default), USD for a US one
//   SQUARE_ENVIRONMENT    optional: "sandbox" when testing with Sandbox credentials
//   FX_FALLBACK_USD_GBP   optional: rate used if the live exchange rate can't be fetched (default 0.75)
//
// Prices live here on the server so they can't be changed in a browser.
// A Square account charges in one currency only, so US orders ($64.99 on the site)
// are charged as the GBP equivalent at the day's European Central Bank rate.

const { randomUUID } = require("crypto");

const PRICES = {
  UK: { currency: "GBP", amount: 4999 }, // £49.99
  US: { currency: "USD", amount: 6499 }  // $64.99
};
const PRODUCT_NAME = "Aureli™ Skin Therapy Wand";
const GIFTS_NOTE = "Includes 3 free gifts: Black Jade Facial Roller, Black Ice Facial Roller, Black Gua Sha Facial Tool";
const SQUARE_VERSION = "2024-07-17";

const env = () => ({
  token: (process.env.SQUARE_ACCESS_TOKEN || "").trim(),
  location: (process.env.SQUARE_LOCATION_ID || "").trim(),
  currency: (process.env.SQUARE_CURRENCY || "GBP").trim().toUpperCase(),
  api: (process.env.SQUARE_ENVIRONMENT || "production").trim().toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com"
});

/* ---------------- exchange rate ---------------- */
const fxCache = new Map();
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function fetchJSON(url, ms = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function rate(from, to) {
  if (from === to) return 1;
  const key = from + ":" + to;
  const hit = fxCache.get(key);
  if (hit && Date.now() - hit.at < SIX_HOURS) return hit.rate;
  const data = await fetchJSON(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`)
            || await fetchJSON(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  const r = Number(data && data.rates && data.rates[to]);
  if (r > 0) { fxCache.set(key, { rate: r, at: Date.now() }); return r; }
  const usdGbp = Number(process.env.FX_FALLBACK_USD_GBP) || 0.75;
  console.warn("FX: using fallback rate for " + key);
  return key === "USD:GBP" ? usdGbp : key === "GBP:USD" ? 1 / usdGbp : 1;
}

async function quote(market) {
  const shown = PRICES[market];
  const charge = env().currency;
  if (shown.currency === charge) return { currency: charge, unitAmount: shown.amount, converted: false };
  const fx = await rate(shown.currency, charge);
  return {
    currency: charge,
    unitAmount: Math.round(shown.amount * fx),
    converted: true,
    shown: { currency: shown.currency, unitAmount: shown.amount }
  };
}

/* ---------------- customer details for pre-filling Square ---------------- */
function cleanCustomer(input, market) {
  if (!input || typeof input !== "object") return null;
  const t = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const email = t(input.email, 254);
  const phone = t(input.phone, 20);
  const address = {
    first_name: t(input.first_name, 60),
    last_name: t(input.last_name, 60),
    address_line_1: t(input.address_line_1),
    address_line_2: t(input.address_line_2),
    locality: t(input.locality, 80),
    administrative_district_level_1: t(input.administrative_district_level_1, 80),
    postal_code: t(input.postal_code, 12),
    country: market === "UK" ? "GB" : "US"
  };
  for (const k of Object.keys(address)) if (!address[k]) delete address[k];
  const data = {};
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) data.buyer_email = email;
  const phoneOk = market === "UK" ? /^\+44\d{9,10}$/.test(phone) : /^\+1[2-9]\d{9}$/.test(phone);
  if (phoneOk) data.buyer_phone_number = phone;
  if (address.address_line_1 && address.locality && address.postal_code) data.buyer_address = address;
  return Object.keys(data).length ? data : null;
}

/* ---------------- Square calls ---------------- */
async function square(path, { method = "GET", body } = {}) {
  const e = env();
  const r = await fetch(e.api + path, {
    method,
    headers: {
      "Authorization": "Bearer " + e.token,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await r.json(); } catch (err) {}
  return { ok: r.ok, status: r.status, data };
}

// Turns Square's error codes into a plain explanation for the self-check.
function explain(errors) {
  const first = errors && errors[0];
  const code = first && first.code;
  const map = {
    UNAUTHORIZED: "Square rejected the access token. Copy the Production access token again (not Sandbox) and update SQUARE_ACCESS_TOKEN in Vercel, then redeploy.",
    ACCESS_TOKEN_EXPIRED: "The access token has expired. Copy a fresh one from Square, update SQUARE_ACCESS_TOKEN in Vercel, then redeploy.",
    ACCESS_TOKEN_REVOKED: "The access token was revoked. Copy a fresh one from Square, update SQUARE_ACCESS_TOKEN in Vercel, then redeploy.",
    NOT_FOUND: "Square couldn't find that location. Copy the Location ID again, update SQUARE_LOCATION_ID in Vercel, then redeploy.",
    FORBIDDEN: "The token doesn't have permission for this. Make sure it's the app's Production access token."
  };
  return map[code] || ("Square returned " + (code || "an error") + (first && first.detail ? ": " + first.detail : "."));
}

async function selfCheck() {
  const e = env();
  const out = {
    token_set: !!e.token,
    location_set: !!e.location,
    environment: e.api.includes("sandbox") ? "sandbox" : "production",
    currency_setting: e.currency
  };
  if (!e.token || !e.location) {
    out.ok = false;
    out.problem = "Missing " + [!e.token && "SQUARE_ACCESS_TOKEN", !e.location && "SQUARE_LOCATION_ID"].filter(Boolean).join(" and ") +
      " in Vercel. Add it under Settings > Environment Variables (tick Production), then redeploy.";
    return out;
  }
  const r = await square("/v2/locations/" + encodeURIComponent(e.location));
  if (!r.ok) { out.ok = false; out.square_status = r.status; out.problem = explain(r.data.errors); return out; }
  const loc = r.data.location || {};
  out.location_status = loc.status;
  out.location_currency = loc.currency;
  out.location_country = loc.country;
  if (loc.currency && loc.currency !== e.currency) {
    out.ok = false;
    out.problem = `Your Square location charges in ${loc.currency} but SQUARE_CURRENCY is ${e.currency}. Set SQUARE_CURRENCY to ${loc.currency} in Vercel and redeploy.`;
    return out;
  }
  if (loc.status && loc.status !== "ACTIVE") {
    out.ok = false;
    out.problem = "That Square location isn't active. Use an active location's ID.";
    return out;
  }
  out.ok = true;
  out.message = "Square is connected. Checkout should work.";
  return out;
}

/* ---------------- handler ---------------- */
function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; } }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const q = req.query || {};

    if (req.method === "GET") {
      if (q.check) return res.status(200).json(await selfCheck());
      if (!PRICES[q.market]) return res.status(400).json({ error: "Invalid market." });
      return res.status(200).json(await quote(q.market));
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "method", message: "Method not allowed." });
    }

    const body = readBody(req);
    const market = body.market === "US" ? "US" : body.market === "UK" ? "UK" : null;
    const qty = Number.parseInt(body.qty, 10);
    if (!market || !Number.isInteger(qty) || qty < 1 || qty > 10) {
      return res.status(400).json({ error: "invalid", message: "Something's not right with your bag. Go back to the shop and try again." });
    }

    const e = env();
    if (!e.token || !e.location) {
      console.error("Checkout: SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID is not set in Vercel.");
      return res.status(503).json({ error: "not_configured", message: "Checkout isn't available right now. Please try again shortly." });
    }

    const price = await quote(market);
    const shownNote = price.converted
      ? `. Price shown on site: ${(price.shown.unitAmount / 100).toFixed(2)} ${price.shown.currency} each, charged in ${price.currency}.`
      : "";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const payload = {
      idempotency_key: randomUUID(),
      order: {
        location_id: e.location,
        reference_id: "AUR-" + randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(),
        metadata: { market },
        line_items: [{
          name: PRODUCT_NAME,
          quantity: String(qty),
          note: GIFTS_NOTE + shownNote,
          base_price_money: { amount: price.unitAmount, currency: price.currency }
        }]
      },
      checkout_options: {
        ask_for_shipping_address: true,
        redirect_url: `https://${host}/thank-you.html`,
        accepted_payment_methods: { apple_pay: true, google_pay: true }
      },
      payment_note: `AURELI website order (${market})`
    };
    const prefill = cleanCustomer(body.customer, market);
    if (prefill) payload.pre_populated_data = prefill;
    // Backup copy of contact details on the order, for the orders dashboard.
    if (prefill) {
      const m = payload.order.metadata;
      if (prefill.buyer_email) m.email = prefill.buyer_email;
      if (prefill.buyer_phone_number) m.phone = prefill.buyer_phone_number;
      const a = prefill.buyer_address;
      const name = a ? [a.first_name, a.last_name].filter(Boolean).join(" ").slice(0, 120) : "";
      if (name) m.name = name;
    }

    let r = await square("/v2/online-checkout/payment-links", { method: "POST", body: payload });
    // If Square objects to the pre-filled details, try once more without them
    // so the customer can still pay (they'll just type their details on Square).
    if (!r.ok && prefill && r.status === 400) {
      console.warn("Square rejected pre-filled details, retrying without:", JSON.stringify(r.data.errors));
      delete payload.pre_populated_data;
      payload.idempotency_key = randomUUID();
      r = await square("/v2/online-checkout/payment-links", { method: "POST", body: payload });
    }
    if (!r.ok || !(r.data.payment_link && r.data.payment_link.url)) {
      console.error("Square error", r.status, JSON.stringify(r.data.errors || r.data));
      return res.status(502).json({ error: "square", message: "We couldn't start payment. Please try again in a moment." });
    }
    return res.status(200).json({ url: r.data.payment_link.url });
  } catch (err) {
    console.error("Checkout crashed:", err);
    return res.status(500).json({ error: "server", message: "We couldn't start payment. Please try again in a moment." });
  }
};

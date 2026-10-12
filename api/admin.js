// AURELI orders dashboard API (Vercel serverless function, Node.js). Used by /admin.html.
//
//   POST /api/admin {action:"login", password}      -> sets a 12-hour session cookie
//   POST /api/admin {action:"logout"}               -> clears it
//   GET  /api/admin                                 -> paid shipping orders from Square + your fulfilment notes
//   POST /api/admin {action:"update", id, ...}      -> save fulfilled / tracking / note for one order
//
// Needs in Vercel > Settings > Environment Variables (then redeploy):
//   DASHBOARD_PASSWORD     the dashboard password (12+ characters)
//   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID      (already set up for checkout)
//
// Orders and customer details are read live from Square. Ticks, tracking and notes are saved
// as small notes (metadata) on the Square order itself, so no extra database is needed.
// The order is left "open" in Square on purpose: Square locks completed orders, and you
// couldn't untick them or add tracking afterwards.

const crypto = require("crypto");

const COOKIE = "aureli_admin";
const SESSION_HOURS = 12;
const SQUARE_VERSION = "2024-07-17";

const cfg = () => ({
  password: process.env.DASHBOARD_PASSWORD || "",
  token: (process.env.SQUARE_ACCESS_TOKEN || "").trim(),
  location: (process.env.SQUARE_LOCATION_ID || "").trim(),
  api: (process.env.SQUARE_ENVIRONMENT || "production").trim().toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com",
});

/* ---------------- sessions ---------------- */
// The signing key comes from the password, so changing the password signs everyone out.
const key = c => crypto.createHash("sha256").update("aureli-admin|" + c.password + "|" + c.token).digest();
const sign = (c, payload) => crypto.createHmac("sha256", key(c)).update(payload).digest("base64url");

function makeSession(c) {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return exp + "." + sign(c, exp);
}
function validSession(c, value) {
  if (!value || !c.password) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(c, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}
function setCookie(res, value, maxAge) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}
function passwordMatches(c, attempt) {
  const a = crypto.createHash("sha256").update(String(attempt || "")).digest();
  const b = crypto.createHash("sha256").update(c.password).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------------- Square ---------------- */
async function square(c, path, body, method) {
  const r = await fetch(c.api + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json", "Square-Version": SQUARE_VERSION },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = data.errors && data.errors[0];
    throw new Error("Square: " + ((e && (e.detail || e.code)) || r.status));
  }
  return data;
}

async function fetchOrders(c) {
  const orders = [];
  let cursor;
  for (let page = 0; page < 5; page++) { // up to 2,500 most recent orders
    const data = await square(c, "/v2/orders/search", {
      location_ids: [c.location],
      limit: 500,
      cursor,
      query: {
        filter: {
          state_filter: { states: ["OPEN", "COMPLETED"] },
          fulfillment_filter: { fulfillment_types: ["SHIPMENT"] }
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" }
      }
    });
    orders.push(...(data.orders || []));
    cursor = data.cursor;
    if (!cursor) break;
  }
  return orders;
}

const money = m => (m ? { amount: m.amount, currency: m.currency } : null);

/* Fulfilment notes live in the order's metadata. Each value is stored as JSON so an empty
   value is still a valid (non-empty) Square metadata string. Square allows 255 characters per value. */
const MK = { status: "aureli_status", link: "aureli_link", note: "aureli_note" };
const parse = v => { try { return JSON.parse(v); } catch (e) { return undefined; } };
function readFulfilment(meta) {
  const st = parse(meta[MK.status]) || {};
  return {
    fulfilled_at: st.f || null,
    carrier: st.c || "",
    tracking: st.t || "",
    updated_at: st.u || null,
    tracking_url: parse(meta[MK.link]) || "",
    note: parse(meta[MK.note]) || ""
  };
}
function fitJSON(text) { // longest JSON string of `text` that fits in 255 characters
  let t = String(text || "");
  while (JSON.stringify(t).length > 255) t = t.slice(0, -1);
  return JSON.stringify(t);
}
function writeFulfilment(f) {
  return {
    [MK.status]: JSON.stringify({ f: f.fulfilled_at || null, c: f.carrier.slice(0, 40), t: f.tracking.slice(0, 60), u: f.updated_at }),
    [MK.link]: fitJSON(f.tracking_url),
    [MK.note]: fitJSON(f.note)
  };
}

function shape(o) {
  const f = (o.fulfillments || []).find(x => x.type === "SHIPMENT") || {};
  const sd = f.shipment_details || {};
  const rec = sd.recipient || {};
  const a = rec.address || {};
  const meta = o.metadata || {};
  const refunded = (o.refunds || []).length > 0 || (o.returns || []).length > 0;
  return {
    id: o.id,
    ref: o.reference_id || ("#" + o.id.slice(-6).toUpperCase()),
    created_at: o.created_at,
    state: o.state,
    market: meta.market || (a.country === "US" ? "US" : "UK"),
    country: a.country || meta.country || "",
    total: money(o.total_money),
    refunded,
    items: (o.line_items || []).map(li => ({ name: li.name, quantity: Number(li.quantity) || 1, note: li.note || "" })),
    customer: {
      name: rec.display_name || [a.first_name, a.last_name].filter(Boolean).join(" ") || meta.name || "",
      email: rec.email_address || meta.email || "",
      phone: rec.phone_number || meta.phone || ""
    },
    address: {
      line1: a.address_line_1 || "",
      line2: a.address_line_2 || "",
      city: a.locality || "",
      region: a.administrative_district_level_1 || "",
      postcode: a.postal_code || "",
      country: a.country || ""
    },
    shipping_note: sd.shipping_note || "",
    fulfilment: readFulfilment(meta),
    locked: o.state === "COMPLETED"
  };
}

/* ---------------- handler ---------------- */
function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; } }
  return {};
}
const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const c = cfg();
  try {
    if (!c.password || c.password.length < 12) {
      return res.status(503).json({ error: "setup", message: "Set DASHBOARD_PASSWORD (12+ characters) in Vercel, then redeploy." });
    }
    const body = req.method === "POST" ? readBody(req) : {};

    if (req.method === "POST" && body.action === "login") {
      if (!passwordMatches(c, body.password)) {
        await new Promise(r => setTimeout(r, 900)); // slows down password guessing
        return res.status(401).json({ error: "password", message: "That password isn't right." });
      }
      setCookie(res, makeSession(c), SESSION_HOURS * 3600);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && body.action === "logout") {
      setCookie(res, "", 0);
      return res.status(200).json({ ok: true });
    }

    if (!validSession(c, readCookie(req, COOKIE))) {
      return res.status(401).json({ error: "auth", message: "Please sign in." });
    }

    if (req.method === "GET") {
      if (!c.token || !c.location) {
        return res.status(503).json({ error: "setup", message: "Square isn't connected. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Vercel." });
      }
      const orders = await fetchOrders(c);
      return res.status(200).json({ storage: true, orders: orders.map(shape) });
    }

    if (req.method === "POST" && body.action === "update") {
      const id = clean(body.id, 64);
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return res.status(400).json({ error: "id", message: "Unknown order." });
      // Read the latest version of the order, then save. Retry once if it changed in between.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { order } = await square(c, "/v2/orders/" + encodeURIComponent(id));
        if (!order || order.location_id !== c.location) return res.status(404).json({ error: "id", message: "Order not found." });
        if (order.state === "COMPLETED" || order.state === "CANCELED") {
          return res.status(409).json({ error: "locked", message: "This order was " + order.state.toLowerCase() + " in Square, so it can't be changed here." });
        }
        const meta = order.metadata || {};
        const existing = readFulfilment(meta);
        const next = {
          fulfilled_at: body.fulfilled === true ? (existing.fulfilled_at || new Date().toISOString())
                      : body.fulfilled === false ? null : existing.fulfilled_at,
          carrier: "carrier" in body ? clean(body.carrier, 40) : existing.carrier,
          tracking: "tracking" in body ? clean(body.tracking, 60) : existing.tracking,
          tracking_url: "tracking_url" in body ? clean(body.tracking_url, 250) : existing.tracking_url,
          note: "note" in body ? clean(body.note, 250) : existing.note,
          updated_at: new Date().toISOString()
        };
        if (next.tracking_url && !/^https?:\/\//i.test(next.tracking_url)) next.tracking_url = "https://" + next.tracking_url;
        try {
          await square(c, "/v2/orders/" + encodeURIComponent(id), {
            idempotency_key: crypto.randomUUID(),
            order: { location_id: c.location, version: order.version, metadata: Object.assign({}, meta, writeFulfilment(next)) }
          }, "PUT");
          return res.status(200).json({ ok: true, fulfilment: readFulfilment(writeFulfilment(next)) });
        } catch (err) {
          if (attempt === 0 && /version/i.test(err.message)) continue; // someone else saved; try again
          throw err;
        }
      }
    }

    return res.status(405).json({ error: "method", message: "Not allowed." });
  } catch (err) {
    console.error("Admin error:", err);
    return res.status(502).json({ error: "server", message: String(err.message || "Something went wrong.").slice(0, 200) });
  }
};

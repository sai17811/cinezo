"use strict";
const express = require("express");
const compression = require("compression");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// ---------- logging ----------
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] || LOG_LEVELS.info;
const fmt = (ts) => new Date(ts).toISOString().replace("T", " ").slice(0, 19);
const log = (level, msg, extra) => {
  if (LOG_LEVELS[level] < LEVEL) return;
  const line = `[${fmt(Date.now())}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
  if (extra) console.log(JSON.stringify(extra, null, 0));
};
const logReq = (req, status, ms) => log("debug", `${req.ip} ${req.method} ${req.path} ? ${status} (${ms}ms)`);

// ---------- config ----------
const PROD = process.env.NODE_ENV === "production";
const PIN = process.env.OWNER_PIN || "1234";
const SECRET = process.env.SECRET || "change-me-in-production";
const OPEN_SEATS = process.env.OPEN_SEATS === "1"; // demo only: accept unsigned seat links
// Razorpay (leave the two keys unset to keep the demo UPI checkout)
const RP = {
  id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET,
};
const RP_ON = !!(RP.id && RP.secret);
const RP_BASE = "https://api.razorpay.com/v1";
const TZ_OFFSET = (+process.env.TZ_OFFSET_MIN || 330) * 60000; // default IST
const SESSION_MS = 12 * 36e5;
const HOUR = 36e5, DAY = 864e5;
const PUBLIC = path.join(__dirname, "public");

if (PROD && !(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)) log("warn", "WARNING: payments are in DEMO mode (no real money). Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to go live.");
if (PROD && (!process.env.OWNER_PIN || !process.env.SECRET || PIN === "1234")) {
  log("error", "Set a real OWNER_PIN (not 1234) and a long random SECRET before running in production.");
  process.exit(1);
}

const MENU = [
  ["Salted Popcorn", 150], ["Caramel Popcorn", 180], ["Cheese Popcorn", 190], ["Coke", 90],
  ["Pepsi", 90], ["Cold Coffee", 120], ["Water Bottle", 40], ["Veg Burger", 140],
  ["Samosa (2 pcs)", 60], ["French Fries", 110], ["Nachos with Cheese", 160],
  ["Large Popcorn + 2 Cokes", 380], ["Ice Cream Cup", 80],
].map(([name, price], i) => ({ id: "m" + i, name, price }));
const FLOW = ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
const CLOSED = ["DELIVERED", "CANCELLED"];
const TAX = 1.05;

// ---------- crypto helpers ----------
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const safeEqual = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const issueToken = () => {
  const exp = Date.now() + SESSION_MS;
  return `${exp}.${hmac("owner:" + PIN + ":" + exp)}`;
};
const validToken = (t = "") => {
  const [exp, sig] = String(t).split(".");
  return +exp > Date.now() && !!sig && safeEqual(sig, hmac("owner:" + PIN + ":" + exp));
};
// A seat QR carries scr/row/no plus this signature, so the seat can't be edited or guessed.
const seatSig = (scr, row, no) => hmac(`seat|${scr}|${String(row).toUpperCase()}|${no}`).slice(0, 12);

// ---------- database ----------
const DB_FILE = process.env.DB_PATH || path.join(__dirname, "seatserve.db");
const db = new DatabaseSync(DB_FILE);
db.exec(`
  pragma journal_mode = WAL;
  pragma synchronous = NORMAL;
  create table if not exists orders (id text primary key, t integer, json text);
  create index if not exists orders_t on orders(t);
  create index if not exists orders_razorpay on orders(json_extract(json, '$.razorpayOrderId'));
  create table if not exists cfg (k text primary key, v text);
`);
const q = {
  get: db.prepare("select json from orders where id = ?"),
  save: db.prepare("insert or replace into orders (id, t, json) values (?, ?, ?)"),
  live: db.prepare("select json from orders where json_extract(json, '$.status') != 'PENDING_PAYMENT' and (t >= ? or json_extract(json, '$.status') not in ('DELIVERED','CANCELLED')) order by t"),
  dropStale: db.prepare("delete from orders where t < ? and json_extract(json, '$.status') = 'PENDING_PAYMENT'"),
  since: db.prepare("select json from orders where t >= ?"),
  getSold: db.prepare("select v from cfg where k = 'sold'"),
  setSold: db.prepare("insert or replace into cfg (k, v) values ('sold', ?)"),
  getByRazorpay: db.prepare("select json from orders where json_extract(json, '$.razorpayOrderId') = ?"),
};
const parse = (rows) => rows.map((r) => JSON.parse(r.json));
const getOrder = (id) => { const r = q.get.get(id); return r && JSON.parse(r.json); };
const saveOrder = (o) => q.save.run(o.id, o.t, JSON.stringify(o));

// ---------- time + stats ----------
const dayStart = (t) => Math.floor((t + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
const fmtDate = (t, o) => new Date(t + TZ_OFFSET).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

function buildStats(range) {
  const now = Date.now(), today = dayStart(now);
  const days = range === "week" ? 7 : range === "month" ? 30 : 1;
  const hourly = days === 1;
  const size = hourly ? HOUR : DAY;
  const since = hourly ? today : today - (days - 1) * DAY;
  const count = hourly ? Math.floor((now - today) / HOUR) + 1 : days;
  const buckets = Array.from({ length: count }, (_, i) => {
    const t = since + i * size;
    const h = i % 12 || 12;
    return { label: hourly ? h + (i < 12 ? "a" : "p") : fmtDate(t, { weekday: "short", day: "numeric" }), orders: 0, revenue: 0 };
  });
  const items = new Map();
  let orders = 0, revenue = 0, cancelled = 0;
  for (const o of parse(q.since.all(since))) {
    if (o.status === "PENDING_PAYMENT") continue;
    if (o.status === "CANCELLED") { cancelled++; continue; }
    const b = buckets[Math.min(count - 1, Math.floor((o.t - since) / size))];
    b.orders++; b.revenue += o.total; orders++; revenue += o.total;
    for (const it of o.items) {
      const s = items.get(it.n) || { name: it.n, qty: 0, sales: 0 };
      s.qty += it.q; s.sales += it.q * it.p; items.set(it.n, s);
    }
  }
  const top = [...items.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  return { range: hourly ? "today" : range, since, orders, revenue, cancelled, avg: orders ? Math.round(revenue / orders) : 0, buckets, top };
}

// ---------- live updates (SSE) ----------
const clients = new Set();
const broadcast = (match, msg) => {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) if (match(c)) c.res.write(data);
};
const pushOrder = (o) => broadcast((c) => c.owner || c.order === o.id, { type: "order", order: o });

// ---------- Razorpay ----------
async function rz(method, urlPath, body) {
  const auth = "Basic " + Buffer.from(RP.id + ":" + RP.secret).toString("base64");
  const r = await fetch(RP_BASE + urlPath, {
    method, signal: AbortSignal.timeout(10000), body: body && JSON.stringify(body),
    headers: { Authorization: auth, "Content-Type": "application/json", "Accept": "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.description || j.error?.error_description || "Razorpay error " + r.status);
  return j;
}
// Safe to call twice (webhook + browser): only a PAID/captured order for the full amount moves the order forward.
// Verifies with Razorpay server-side so a fake/cancelled payment can't be forced through.
// Uses the razorpayOrderId index instead of scanning all orders.
async function confirmPayment(id) {
  let o = getOrder(id);
  if (!o) {
    // id may be a Razorpay order_id; resolve by razorpayOrderId using the index
    const r = q.getByRazorpay.get(id);
    if (r) o = JSON.parse(r.json);
  }
  if (!o) { log("warn", "confirmPayment: order not found", { id }); return null; }
  if (o.status !== "PENDING_PAYMENT") { log("info", "confirmPayment: order not pending, skipping", { id, status: o.status }); return o; }
  log("info", "confirmPayment: querying Razorpay", { id, razorpayOrderId: o.razorpayOrderId });
  try {
    const s = await rz("GET", "/orders/" + encodeURIComponent(o.razorpayOrderId || id));
    log("info", "confirmPayment: Razorpay response", { id, razorpayStatus: s.status, amount: s.amount, expected: o.total * 100 });
    if (s.receipt !== o.id) { log("warn", "confirmPayment: receipt mismatch", { id, expected: o.id, got: s.receipt }); return { ...o, unpaid: true }; }
    if (s.status !== "paid" || Number(s.amount) !== o.total * 100) { log("warn", "confirmPayment: Razorpay reports unpaid or wrong amount", { id, status: s.status, amount: s.amount, expected: o.total * 100 }); return { ...o, unpaid: true }; }
    o.status = "RECEIVED"; o.paid = "Razorpay";
    saveOrder(o); pushOrder(o);
    log("info", "confirmPayment: payment confirmed", { id, status: o.status, total: o.total });
    return o;
  } catch (e) {
    log("error", "confirmPayment: Razorpay API error", { id, error: e.message });
    throw e;
  }
}

// ---------- rate limiting ----------
const buckets = new Map();
const idem = new Map(); // idempotency keys -> { ts, res }
function limit(key, max, windowMs) {
  const now = Date.now(), hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now); buckets.set(key, hits);
  return hits.length > max;
}
setInterval(() => { const cut = Date.now() - 36e5; for (const [k, v] of buckets) if (v[v.length - 1] < cut) buckets.delete(k); }, 6e5).unref();
setInterval(() => { const cut = Date.now() - 15 * 60000; for (const [k, v] of idem) if (v.ts < cut) idem.delete(k); }, 5 * 60000).unref();

// ---------- app ----------
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb", verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); } }));
app.use(compression());
app.use((req, res, next) => {
  const start = Date.now();
  const origEnd = res.end;
  res.end = function (...args) {
    logReq(req, res.statusCode, Date.now() - start);
    return origEnd.apply(this, args);
  };
  next();
});
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  });
  // Only set CSP on HTML and API responses � static files inherit CSP from the
  // HTML page that loads them and would otherwise cache an outdated CSP header.
  const isStatic = /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|woff|ttf|eot)(\?.*)?$/.test(req.path);
  if (!isStatic) {
    res.set({
      "Content-Security-Policy": "default-src 'self' https://cinezo.in; script-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://cinezo.in https://api.razorpay.com https://lumberjack.razorpay.com; frame-src https://checkout.razorpay.com https://api.razorpay.com; base-uri 'self'; form-action 'self';",
    });
  }
  if (PROD) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
const owner = (req, res, next) =>
  validToken((req.get("authorization") || "").replace(/^Bearer /, "")) ? next() : res.status(401).json({ error: "Owner login required" });

app.get("/healthz", (req, res) => res.send("ok"));
app.get("/api/sold", (req, res) => {
  const row = q.getSold.get();
  res.json({ ids: row ? JSON.parse(row.v) : [] });
});

app.post("/api/login", (req, res) => {
  if (limit("login:" + req.ip, 10, 15 * 60000)) return res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
  if (!safeEqual(req.body?.pin ?? "", PIN)) return res.status(401).json({ error: "Wrong PIN" });
  res.json({ token: issueToken() });
});

// Owner: signatures for a run of seats in one row, used when printing QR stickers.
app.post("/api/seats/sign", owner, (req, res) => {
  const { scr, row } = req.body || {}, from = parseInt(req.body?.from), to = parseInt(req.body?.to);
  if (!/^\d{1,2}$/.test(String(scr)) || !/^[A-Za-z]{1,2}$/.test(String(row)) || !(from >= 1) || !(to >= from) || to - from >= 100)
    return res.status(400).json({ error: "Invalid seat range" });
  res.json({ seats: Array.from({ length: to - from + 1 }, (_, i) => ({ no: from + i, sig: seatSig(scr, row, from + i) })) });
});

app.get("/api/orders", owner, (req, res) => res.json(parse(q.live.all(dayStart(Date.now())))));
app.get("/api/stats", owner, (req, res) => res.json(buildStats(String(req.query.range))));
app.get("/api/orders/:id", (req, res) => {
  const o = getOrder(req.params.id);
  if (o) { log("debug", "Order fetch", { id: req.params.id, status: o.status, paid: o.paid }); res.json(o); }
  else { log("warn", "Order fetch: not found", { id: req.params.id }); res.status(404).json({ error: "Not found" }); }
});

// Validates seat signature + cart, prices everything server-side, returns an unsaved order.
function prepareOrder(b) {
  // refresh sold from DB for multi-device consistency
  const soldRow = q.getSold.get();
  const sold = soldRow ? JSON.parse(soldRow.v) : [];
  const s = b.seat || {};
  if (!/^\d{1,2}$/.test(String(s.scr)) || !/^[A-Za-z]{1,2}$/.test(String(s.row)) || !/^\d{1,3}$/.test(String(s.no)))
    return { status: 400, error: "Invalid seat" };
  if (!OPEN_SEATS && !safeEqual(s.sig || "", seatSig(s.scr, s.row, s.no)))
    return { status: 403, error: "Please scan the QR code on the seat in front of you." };
  const items = [];
  let sub = 0;
  for (const it of Array.isArray(b.items) ? b.items.slice(0, 20) : []) {
    const m = MENU.find((x) => x.id === it.id), qty = Math.min(10, Math.max(0, parseInt(it.q) || 0));
    if (!m || !qty) continue;
    if (sold.includes(m.id)) return { status: 409, error: m.name + " is sold out." };
    items.push({ n: m.name, q: qty, p: m.price });
    sub += m.price * qty;
  }
  if (!items.length) return { status: 400, error: "Cart is empty." };
  const row = String(s.row).toUpperCase();
  return {
    order: {
      id: "SS" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      seat: `Screen ${s.scr} · Row ${row} · Seat ${s.no}`,
      screen: String(s.scr), row,
      name: String(b.name || "Guest").slice(0, 40), note: String(b.note || "").slice(0, 120),
      items, total: Math.round(sub * TAX), status: "RECEIVED", t: Date.now(),
    },
  };
}

app.get("/api/config", (req, res) => res.json({ payments: RP_ON ? "razorpay" : "demo" }));

app.post("/api/pay", async (req, res) => {
  if (limit("pay:" + req.ip, 30, 36e5)) return res.status(429).json({ error: "Too many orders. Try again later." });
  const idemKey = req.get("idempotency-key") || "";
  if (idemKey) {
    const hit = idem.get(idemKey);
    if (hit && hit.ts > Date.now() - 15 * 60000) return res.status(hit.status).json(hit.body);
  }
  const b = req.body || {};
  const upi = String(b.upi || "").trim().toLowerCase(), phone = String(b.phone || "").replace(/\D/g, "").slice(-10);
  if (!RP_ON) {
    if (!/^[\w.-]+@[\w-]+$/.test(upi)) return res.status(400).json({ error: "Enter a valid UPI ID." });
    if (upi.startsWith("fail")) return res.status(402).json({ error: "Payment failed. Try again or use another UPI ID." });
  } else if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });

  const prep = prepareOrder(b);
  if (prep.error) return res.status(prep.status).json({ error: prep.error });
  const order = prep.order;

  let status = 200, body = null;
  if (!RP_ON) { // demo checkout: instantly "paid"
    order.paid = "UPI " + upi;
    saveOrder(order); pushOrder(order);
    body = order;
  } else {
    order.status = "PENDING_PAYMENT"; order.paid = "Razorpay";
    try {
      const ro = await rz("POST", "/orders", {
        amount: order.total * 100, currency: "INR", receipt: order.id,
        notes: { orderId: order.id, seat: order.seat },
      });
      order.razorpayOrderId = ro.id;
      saveOrder(order);
      body = { id: order.id, sessionId: ro.id, keyId: RP.id, amount: order.total * 100, mode: "live" };
    } catch (e) {
      log("error", "Razorpay create order failed", { ip: req.ip, error: e.message });
      status = 502; body = { error: "Payment service is unavailable. Please try again." };
    }
  }
  if (idemKey) idem.set(idemKey, { ts: Date.now(), status, body });
  res.status(status).json(body);
});

// Browser calls this after the Razorpay window closes; the order only goes live once Razorpay confirms capture.
app.post("/api/pay/verify", async (req, res) => {
  if (!RP_ON) return res.status(404).json({ error: "Not found" });
  try {
    const { id, razorpay_payment_id, razorpay_signature } = req.body || {};
    log("info", "Verify request", { id, payment_id: razorpay_payment_id });
    const o = getOrder(String(id));
    if (!o) { log("warn", "Verify: order not found", { id }); return res.status(404).json({ error: "Not found" }); }
    // Razorpay signature = HMAC_SHA256(order_id|payment_id, key_secret) as hex — proves Razorpay issued this payment.
    const sig = crypto.createHmac("sha256", RP.secret).update(`${o.razorpayOrderId || o.id}|${razorpay_payment_id}`).digest("hex");
    if (!safeEqual(sig, razorpay_signature || "")) { log("warn", "Verify: invalid signature", { id }); return res.status(400).json({ error: "Invalid payment signature." }); }
    log("info", "Verify: signature OK, confirming with Razorpay", { id });
    const done = await confirmPayment(String(id)); // server-to-server Razorpay check: paid + full amount
    if (!done) { log("warn", "Verify: Razorpay confirmation returned null", { id }); return res.status(404).json({ error: "Not found" }); }
    if (done.unpaid) { log("warn", "Verify: Razorpay reports unpaid", { id, status: done.status }); return res.status(402).json({ error: "Payment not completed." }); }
    done.paymentId = razorpay_payment_id;
    saveOrder(done); pushOrder(done);
    log("info", "Verify: payment confirmed, order live", { id, status: done.status, total: done.total });
    res.json(done);
  } catch (e) { log("error", "Verify: exception", { error: e.message, stack: e.stack }); res.status(502).json({ error: "Could not confirm payment. If money was deducted, the order will appear shortly." }); }
});

// Client-side fallback: confirm payment by order ID when Razorpay checkout v2
// closes without calling the handler callback. Safe because confirmPayment()
// queries Razorpay server-to-server and only confirms if Razorpay says paid.
app.post("/api/orders/:id/confirm", async (req, res) => {
  if (!RP_ON) return res.status(404).json({ error: "Not found" });
  const id = String(req.params.id);
  log("info", "Order confirm request", { id });
  try {
    const done = await confirmPayment(id);
    if (!done) { log("warn", "Order confirm: not found", { id }); return res.status(404).json({ error: "Not found" }); }
    if (done.unpaid) { log("warn", "Order confirm: Razorpay reports unpaid", { id, status: done.status }); return res.status(402).json({ error: "Payment not completed." }); }
    log("info", "Order confirm: payment confirmed", { id, status: done.status, total: done.total });
    res.json(done);
  } catch (e) { log("error", "Order confirm: exception", { id, error: e.message }); res.status(502).json({ error: "Could not confirm payment." }); }
});

// Razorpay server-to-server callback (covers closed tabs and flaky networks). Signature = HMAC-SHA256(payload, webhook_secret).
app.post("/api/razorpay/webhook", async (req, res) => {
  if (!RP_ON) return res.sendStatus(404);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody || "").digest("hex");
  if (!secret || !safeEqual(req.get("x-razorpay-signature") || "", expected)) return res.sendStatus(401);
  const { event, payload } = req.body || {};
  if (event === "payment.captured" && payload?.payment?.entity) {
    const id = payload.payment.entity.order_id;
    try { await confirmPayment(id); } catch (e) { return res.sendStatus(500); }
  } else if (event === "payment.failed" && payload?.payment?.entity) {
    const id = payload.payment.entity.order_id;
    const r = q.getByRazorpay.get(id);
    if (r) {
      const o = JSON.parse(r.json);
      if (o.status === "PENDING_PAYMENT") {
        o.status = "CANCELLED";
        saveOrder(o); pushOrder(o);
      }
    }
  }
  res.sendStatus(200);
});

app.patch("/api/orders/:id", (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  const action = req.body?.action;
  if (action === "issue") {
    if (limit("issue:" + req.ip, 20, 36e5)) return res.status(429).json({ error: "Too many reports. Try again later." });
    if (CLOSED.includes(o.status)) return res.status(400).json({ error: "Closed" });
    o.issue = true;
  } else {
    if (!validToken((req.get("authorization") || "").replace(/^Bearer /, ""))) return res.status(401).json({ error: "Owner login required" });
    if (action === "advance") {
      const i = FLOW.indexOf(o.status);
      if (i < 0 || i >= FLOW.length - 1) return res.status(400).json({ error: "Cannot advance" });
      o.status = FLOW[i + 1]; o.issue = false;
    } else if (action === "cancel") {
      if (!["RECEIVED", "PREPARING"].includes(o.status)) return res.status(400).json({ error: "Cannot cancel" });
      o.status = "CANCELLED";
    } else return res.status(400).json({ error: "Unknown action" });
  }
  saveOrder(o); pushOrder(o); res.json(o);
});

app.post("/api/sold", owner, (req, res) => {
  const id = String(req.body?.id);
  if (!MENU.some((m) => m.id === id)) return res.status(400).json({ error: "Unknown item" });
  const row = q.getSold.get();
  const sold = row ? JSON.parse(row.v) : [];
  const next = sold.includes(id) ? sold.filter((x) => x !== id) : [...sold, id];
  q.setSold.run(JSON.stringify(next));
  broadcast(() => true, { type: "sold", ids: next });
  res.json({ ids: next });
});

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const c = { res, owner: validToken(req.query.token), order: String(req.query.order || "") };
  clients.add(c);
  res.write(": ok\n\n");
  const hb = setInterval(() => res.write(": hb\n\n"), 25000);
  req.on("close", () => { clearInterval(hb); clients.delete(c); });
});

// ---------- static (index pre-gzipped, cached by ETag) ----------
const INDEX = fs.readFileSync(path.join(PUBLIC, "index.html"));
const INDEX_GZ = zlib.gzipSync(INDEX, { level: 9 });
const INDEX_ETAG = `"${crypto.createHash("sha1").update(INDEX).digest("hex").slice(0, 16)}"`;
app.get(["/", "/index.html"], (req, res) => {
  res.set({ ETag: INDEX_ETAG, "Cache-Control": "no-cache", "Content-Type": "text/html; charset=utf-8", Vary: "Accept-Encoding" });
  if (req.get("if-none-match") === INDEX_ETAG) return res.status(304).end();
  if (/\bgzip\b/.test(req.get("accept-encoding") || "")) { res.set("Content-Encoding", "gzip"); return res.end(INDEX_GZ); }
  res.end(INDEX);
});
app.use(express.static(PUBLIC, { maxAge: "1d", index: false }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// ---------- error handler ----------
app.use((err, req, res, next) => {
  log("error", "Unhandled request error", { ip: req.ip, path: req.path, error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ---------- housekeeping ----------
function backup() {
  if (DB_FILE === ":memory:") return;
  const dir = process.env.BACKUP_DIR || path.join(path.dirname(DB_FILE), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `seatserve-${new Date().toISOString().slice(0, 10)}.db`);
  fs.rmSync(file, { force: true });
  db.prepare("vacuum into ?").run(file);
  fs.readdirSync(dir).filter((n) => /^seatserve-.*\.db$/.test(n)).sort().slice(0, -7).forEach((n) => fs.rmSync(path.join(dir, n)));
}
const housekeeping = () => { q.dropStale.run(Date.now() - HOUR); }; // abandoned checkouts

// ---------- start ----------
if (require.main === module) {
  const port = process.env.PORT || 3000;
  try { backup(); } catch (e) { log("error", "Backup failed", { error: e.message }); }
  setInterval(() => { try { backup(); } catch (e) { log("error", "Backup failed", { error: e.message }); } }, DAY).unref();
  setInterval(housekeeping, HOUR).unref();
  const server = app.listen(port, () => console.log("SeatServe running on port " + port));
  const stop = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
}
module.exports = { app, seatSig };



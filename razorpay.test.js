// Razorpay flow against a mocked Razorpay API (no credentials needed).
process.env.DB_PATH = ":memory:";
process.env.OWNER_PIN = "4321";
process.env.SECRET = "test-secret";
process.env.RAZORPAY_KEY_ID = "rzp_live_app_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "wh_secret";
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const { app, seatSig } = require("./server");

const orders = {}; // what the fake Razorpay knows: order_id -> { amount, status, receipt }
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (!String(url).includes("api.razorpay.com")) return realFetch(url, opts);
  const auth = String(opts.headers && opts.headers.Authorization || "");
  assert.ok(auth.startsWith("Basic "), "expected basic auth");
  const [user, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  assert.strictEqual(user, "rzp_live_app_id");
  assert.strictEqual(secret, "rzp_secret");
  if (opts.method === "POST") {
    const b = JSON.parse(opts.body || "{}");
    const id = "order_" + crypto.randomBytes(4).toString("hex");
    orders[id] = { amount: b.amount, status: "created", receipt: b.receipt };
    return Response.json({ id, amount: b.amount, currency: "INR", status: "created" });
  }
  const id = String(url).split("/").pop();
  const o = orders[id];
  if (!o) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ id, amount: o.amount, status: o.status, receipt: o.receipt });
};

let base, server, token;
test.before(async () => {
  await new Promise((ok) => { server = app.listen(0, () => { base = "http://127.0.0.1:" + server.address().port; ok(); }); });
  token = (await call("POST", "/api/login", { pin: "4321" })).body.token;
});
test.after(() => server.close());

const call = async (method, url, body, headers = {}, raw) => {
  const r = await fetch(base + url, {
    method, body: raw ?? (body && JSON.stringify(body)),
    headers: { "Content-Type": "application/json", ...headers },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const auth = () => ({ Authorization: "Bearer " + token });
const sigFor = (orderId, paymentId) => crypto.createHmac("sha256", "rzp_secret").update(`${orderId}|${paymentId}`).digest("hex");
const start = (no) => call("POST", "/api/pay", {
  seat: { scr: "1", row: "C", no: String(no), sig: seatSig(1, "C", no) }, items: [{ id: "m3", q: 1 }], phone: "9876543210", name: "T",
});

test("order stays hidden until Razorpay reports captured", async () => {
  assert.strictEqual((await call("GET", "/api/config")).body.payments, "razorpay");
  assert.strictEqual((await call("POST", "/api/pay", { seat: {}, items: [], phone: "123" })).status, 400);

  const o = (await start(1)).body;
  assert.strictEqual(o.mode, "live");
  assert.ok(o.keyId, "keyId returned");
  assert.ok(o.sessionId, "razorpay order id returned");
  assert.strictEqual(o.amount, 95 * 100); // Coke ₹90 + 5% GST = ₹95
  assert.deepStrictEqual((await call("GET", "/api/orders", null, auth())).body, []);

  // wrong signature rejected
  assert.strictEqual((await call("POST", "/api/pay/verify", { id: o.id, razorpay_payment_id: "pay_x", razorpay_signature: "bad" })).status, 400);

  // payment not yet captured -> 402
  assert.strictEqual((await call("POST", "/api/pay/verify", { id: o.id, razorpay_payment_id: "pay_x", razorpay_signature: sigFor(o.sessionId, "pay_x") })).status, 402);

  orders[o.sessionId].status = "paid";
  const done = await call("POST", "/api/pay/verify", { id: o.id, razorpay_payment_id: "pay_x", razorpay_signature: sigFor(o.sessionId, "pay_x") });
  assert.strictEqual(done.body.status, "RECEIVED");
  assert.strictEqual(done.body.paid, "Razorpay");
  assert.strictEqual((await call("GET", "/api/orders", null, auth())).body.length, 1);
  assert.strictEqual((await call("GET", "/api/stats?range=today", null, auth())).body.orders, 1);
});

test("webhook needs a valid signature and confirms the order", async () => {
  const o = (await start(2)).body;
  orders[o.sessionId].status = "paid";
  const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: o.sessionId } } } });
  const sig = crypto.createHmac("sha256", "wh_secret").update(raw).digest("hex");

  assert.strictEqual((await call("POST", "/api/razorpay/webhook", null, { "x-razorpay-signature": "bad" }, raw)).status, 401);
  assert.strictEqual((await call("POST", "/api/razorpay/webhook", null, { "x-razorpay-signature": sig }, raw)).status, 200);
  assert.strictEqual((await call("GET", "/api/orders/" + o.id)).body.status, "RECEIVED");
});

test("wrong amount or receipt is not accepted as captured", async () => {
  const o = (await start(3)).body;
  orders[o.sessionId] = { amount: 100, status: "paid", receipt: "other-order" }; // amount mismatch + wrong receipt
  assert.strictEqual((await call("POST", "/api/pay/verify", { id: o.id, razorpay_payment_id: "pay_y", razorpay_signature: sigFor(o.sessionId, "pay_y") })).status, 402);
});

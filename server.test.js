process.env.DB_PATH = ":memory:";
process.env.OWNER_PIN = "4321";
process.env.SECRET = "test-secret";
const test = require("node:test");
const assert = require("node:assert");
const { app, seatSig } = require("./server");

let base, server;
test.before(() => new Promise((ok) => { server = app.listen(0, () => { base = "http://127.0.0.1:" + server.address().port; ok(); }); }));
test.after(() => server.close());

const call = async (method, url, body, token) => {
  const r = await fetch(base + url, {
    method, body: body && JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
  });
  return { status: r.status, body: await r.json() };
};
const order = (seat, items = [{ id: "m0", q: 2 }]) => call("POST", "/api/pay", { seat, items, upi: "a@upi", name: "T" });

test("seat QR is enforced and the order is delivered to the signed seat", async () => {
  assert.strictEqual((await order({ scr: "1", row: "F", no: "5" })).status, 403);
  assert.strictEqual((await order({ scr: "1", row: "F", no: "5", sig: seatSig(1, "F", 6) })).status, 403);
  const r = await order({ scr: "1", row: "f", no: "5", sig: seatSig(1, "F", 5) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.seat, "Screen 1 · Row F · Seat 5");
  assert.strictEqual(r.body.total, 315); // 2 x 150 + 5%
});

test("owner login, sticker signing and reports", async () => {
  assert.strictEqual((await call("POST", "/api/login", { pin: "0000" })).status, 401);
  const { body: { token } } = await call("POST", "/api/login", { pin: "4321" });
  assert.strictEqual((await call("GET", "/api/stats?range=today")).status, 401);

  const sign = await call("POST", "/api/seats/sign", { scr: "2", row: "A", from: 1, to: 3 }, token);
  assert.strictEqual(sign.body.seats.length, 3);
  assert.strictEqual(sign.body.seats[0].sig, seatSig(2, "A", 1));

  for (const range of ["today", "week", "month"]) {
    const st = (await call("GET", "/api/stats?range=" + range, null, token)).body;
    assert.strictEqual(st.orders, 1);
    assert.strictEqual(st.revenue, 315);
    assert.strictEqual(st.top[0].name, "Salted Popcorn");
    assert.strictEqual(st.buckets.reduce((a, b) => a + b.orders, 0), 1);
  }
});

test("cancel and advance rules", async () => {
  const { body: { token } } = await call("POST", "/api/login", { pin: "4321" });
  const o = (await order({ scr: "1", row: "F", no: "7", sig: seatSig(1, "F", 7) })).body;
  assert.strictEqual((await call("PATCH", "/api/orders/" + o.id, { action: "advance" })).status, 401);
  assert.strictEqual((await call("PATCH", "/api/orders/" + o.id, { action: "cancel" }, token)).body.status, "CANCELLED");
  assert.strictEqual((await call("GET", "/api/stats?range=today", null, token)).body.cancelled, 1);
});

test("index is gzipped, cached and its scripts parse", async () => {
  const r = await fetch(base + "/", { headers: { "accept-encoding": "gzip" } });
  assert.strictEqual(r.headers.get("content-encoding"), "gzip");
  assert.strictEqual((await fetch(base + "/", { headers: { "if-none-match": r.headers.get("etag") } })).status, 304);
  for (const m of (await r.text()).matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]);
  assert.strictEqual((await call("GET", "/api/config")).body.payments, "demo");
});

const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldCode = 'async function confirmPayment(id) {\n  let o = getOrder(id);\n  if (!o) { // id may be a Razorpay order_id; resolve by razorpayOrderId\n    for (const cand of parse(q.since.all(0))) {\n      if (cand.razorpayOrderId === id) { o = cand; break; }\n    }\n  }\n  if (!o || o.status !== " PENDING_PAYMENT\) return o;\n const s = await rz(\GET\, \/orders/\ + encodeURIComponent(o.razorpayOrderId || id));\n if (s.receipt !== o.id) return { ...o, unpaid: true };\n if (s.status !== \paid\ || Number(s.amount) !== o.total * 100) return { ...o, unpaid: true };\n o.status = \RECEIVED\; o.paid = \Razorpay\;\n saveOrder(o); pushOrder(o);\n return o;\n}';

const newCode = 'async function confirmPayment(id) {\n let o = getOrder(id);\n if (!o) {\n // id may be a Razorpay order_id; resolve by razorpayOrderId using the index\n const r = q.getByRazorpay.get(id);\n if (r) o = JSON.parse(r.json);\n }\n if (!o || o.status !== \PENDING_PAYMENT\) return o;\n const s = await rz(\GET\, \/orders/\ + encodeURIComponent(o.razorpayOrderId || id));\n if (s.receipt !== o.id) return { ...o, unpaid: true };\n if (s.status !== \paid\ || Number(s.amount) !== o.total * 100) return { ...o, unpaid: true };\n o.status = \RECEIVED\; o.paid = \Razorpay\;\n saveOrder(o); pushOrder(o);\n return o;\n}';

content = content.replace(oldCode, newCode);
fs.writeFileSync('server.js', content);
console.log('Step 3 done');

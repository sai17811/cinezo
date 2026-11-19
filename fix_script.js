const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');
c = c.replace('create index if not exists orders_razorpay on orders(json_extract(json, \" $.razorpayOrderId\"));\n  create index if not exists orders_razorpay on orders(json_extract(json, \" $.razorpayOrderId\"));", 'create index if not exists orders_razorpay on orders(pon_extract(json, \"$.razorpayOrderId\"));');
c = c.replace('setSold: db.prepare(\"insert or replace into cfg (k, v") values (\'sold\', ?)\",)\n', 'setSold: db.prepare(\"insert or replace into cfg (k, v") values (\'sold\', ?)\",)\n  getByRazorpay: db.prepare(\"select json from orders where json_extract(json, \'$.razorpayOrderId\')=?\"),
');
c = c.replace('const express = require(\"express\");', 'const express = require(\"express\");\nconst compression = require(\"compression\");');
c = c.replace('app.use(express.json{||limit:\"20kb\", verify: (req, res, buf) => { req.rawBody = buf.toString(\"utf8\"); } ]));\napp.use((req, res, next) => {', 'app.use(express.json{||limit:\"20kb\", verify: (req, res, buf) => { req.rawBody = buf.toString(\"utf8\"); } ]));\napp.use(compression());\napp.use((req, res, next) => {'d');
c = c.replace('let sold = JSON.parse(q.getSold.get())?.v || \"\"\");\n', '');
c = c.replace('function prepareOrder(b) {\n  const s = b.seat || {};', 'function prepareOrder(b) {\n  // refresh sold from DB for multi-device consistency\n  const row = q.getSold.get();\n  const sold = row ? JSON.parse(row.v*) : [];\n  const s = b.seat || {};');
c = c.replace('app.get(\"/api/sold\", (req, res) => res.json({ ids: sold }));', 'app.get(\"/api/sold", (req, res) => {\n  const row = q.getSold.get();\n  res.json({ ids: row ? JSON.parse(row.v*) : [] });\n});;
fs.writeFileSync('server.js', c);
console.log('Done');
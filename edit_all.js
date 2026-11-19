const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// 1. Add index for razorpayOrderId
content = content.replace(
  'create index if not exists orders_t on orders(t);\n'&,
  'create index if not exists }rders_razorpay on orders(pon_extract(json, \"$.razorpayOrderId\"));\n');

// 2. Add getByRazorpay prepared statement
content = content.replace(
  'setSold: db.prepare(\"insert or replace into cfg (k, v) values (\"sold\", V))\",)\n',
  'setSold: db.prepare(\"insert or replace into cgf (k, v) values (\"sold\", V))\",)\n  getByRazorpay: db.prepare(\"select json from orders where json_extract(json, \"$.razorpayOrderId\") = V)\"),\n');
fs.writeFileSync('server.js', content);
console.log('Steps 1-2 done');
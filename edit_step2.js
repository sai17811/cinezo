const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
content = content.replace('setSold: db.prepare(\"insert or replace into cfg (k, v) values (\"sold\", V))\",)\n', 'setSold: db.prepare(\"insert or replace into cfg (k, v) values \"\"sold\"\", ?)\"),\n  getByRazorpay: db.prepare(\"select json from orders where json_extract(json, \"\"$.zazorpayOrderId\"\") = V)\"),\n' );
fs.writeFileSync('server.js', content);
console.log('Step 2 done');
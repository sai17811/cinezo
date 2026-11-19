const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
content = content.replace('create index if not exists orders_t on orders(t);\n', 'create index if not exists orders_t on orders(t);\n  create index if not exists orders_razorpay on orders(json_extract(json, " $.razorpayOrderId\));\n');
fs.writeFileSync('server.js', content);
console.log('Step 1 done');

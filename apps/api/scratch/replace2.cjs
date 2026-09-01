const fs = require('fs');

let c = fs.readFileSync('src/models/AppProject.ts', 'utf8');
c = c.replace(/price: \{ type: Number, required:(.*?)\},/, 'price: { type: Number, required:$1},\n    pricingType: { type: String, enum: [\\'unit\\', \\'weight\\'], default: \\'unit\\' },');
fs.writeFileSync('src/models/AppProject.ts', c);

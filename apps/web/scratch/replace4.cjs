const fs = require('fs');

let t = fs.readFileSync('src/components/phone/types.ts', 'utf8');
t = t.replace(/export type OrderItem = \{([\s\S]*?)\};/, "export type OrderItem = {$1  quantity?: number;\n  pricingType?: 'unit' | 'weight';\n};");
fs.writeFileSync('src/components/phone/types.ts', t);

let pr = fs.readFileSync('src/components/phone/ProductRow.tsx', 'utf8');
pr = pr.replace(/onAdd: \(product: PreviewProduct\) => void;/, "onAdd: (product: PreviewProduct, qty?: number) => void;");
pr = pr.replace(/quantity === 0 \? \(/, "product.pricingType === 'weight' ? (\n          <div className=\"phone__stepper\" style={{ gap: '4px' }}>\n            <input type=\"number\" step=\"0.001\" min=\"0.001\" placeholder=\"Kg\" id={`kg-${product.name}`} style={{ width: '60px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} />\n            <button type=\"button\" onClick={() => {\n              let el = document.getElementById(`kg-${product.name}`);\n              if(el && el.value) onAdd(product, parseFloat(el.value));\n            }} style={{ background: 'var(--ep-primary, #FF6B2C)', color: '#fff', padding: '4px 8px', borderRadius: '4px' }}>Add</button>\n          </div>\n        ) : quantity === 0 ? (");
fs.writeFileSync('src/components/phone/ProductRow.tsx', pr);

let mv = fs.readFileSync('src/components/phone/MenuView.tsx', 'utf8');
mv = mv.replace(/onAddToCart: \(product: PreviewProduct\) => void;/, "onAddToCart: (product: PreviewProduct, qty?: number) => void;");
mv = mv.replace(/onAddToCart=\{\(product\) => setCart\(\(list\) => \[\.\.\.list, \{ name: product\.name, price: product\.price \}\]\)\}/, "onAddToCart={(product, qty = 1) => setCart(list => [...list, { name: product.name, price: product.price * qty, quantity: qty, pricingType: product.pricingType }])}");
fs.writeFileSync('src/components/phone/MenuView.tsx', mv);


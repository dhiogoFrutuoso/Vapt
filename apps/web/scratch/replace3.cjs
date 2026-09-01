const fs = require('fs');

let c = fs.readFileSync('src/pages/EditorPage.tsx', 'utf8');

c = c.replace(/const \[prodPrice, setProdPrice\] = useState\(''\);/, "const [prodPrice, setProdPrice] = useState('');\n  const [prodPricingType, setProdPricingType] = useState<'unit' | 'weight'>('unit');");

c = c.replace(/price: priceVal,/, "price: priceVal,\n          pricingType: prodPricingType,");
c = c.replace(/price: priceVal,/, "price: priceVal,\n          pricingType: prodPricingType,");

c = c.replace(/setProdPrice\(String\(p\.price\)\);/, "setProdPrice(String(p.price));\n      setProdPricingType(p.pricingType || 'unit');");

// The clear block
c = c.replace(/setProdPrice\(''\);/, "setProdPrice('');\n      setProdPricingType('unit');");

// The UI part: Add the radio buttons right after prodPrice input
const uiInsert = `
              </div>
              <div className="ep-field">
                <label>Tipo de Venda</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="radio" name="pricingType" value="unit" checked={prodPricingType === 'unit'} onChange={() => setProdPricingType('unit')} /> Por Unidade
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="radio" name="pricingType" value="weight" checked={prodPricingType === 'weight'} onChange={() => setProdPricingType('weight')} /> Por Peso (Ex: Açai/Kg)
                  </label>
                </div>
              </div>`;

c = c.replace(/<div className="ep-field">\s*<label>Preço \(R\$\)<\/label>\s*<input[^>]+>\s*<\/div>/, match => match + uiInsert);

fs.writeFileSync('src/pages/EditorPage.tsx', c);

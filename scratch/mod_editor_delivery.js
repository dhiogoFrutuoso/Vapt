import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'EditorPreview.tsx');
let content = fs.readFileSync(file, 'utf8');

const oldDeliveryView = `<DeliveryView orders={deliveries} interactive={interactive} onAdvance={advanceDelivery} />`;
const newDeliveryView = `<DeliveryView 
              orders={deliveries} 
              interactive={interactive} 
              onAdvance={advanceDelivery} 
              onRevert={(id) => {
                setDeliveries(list => list.map(d => d.id === id ? { ...d, status: 'novo', total: sumItems(d.items) } : d));
                showFlash('De volta à Recepção!');
              }}
              onCancel={(id) => {
                setDeliveries(list => list.filter(d => d.id !== id));
                showFlash('Pedido excluído!');
              }}
            />`;

content = content.replace(oldDeliveryView, newDeliveryView);

fs.writeFileSync(file, content, 'utf8');

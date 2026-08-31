import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'EditorPreview.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add 'recepcao' to view union
content = content.replace(
  "const [view, setView] = useState<'menu' | 'salao' | 'entrega'>('menu');",
  "const [view, setView] = useState<'menu' | 'salao' | 'entrega' | 'recepcao'>('menu');"
);

// 2. Add ReceptionView import if missing
if (!content.includes('ReceptionView')) {
  content = content.replace(
    "import { DeliveryView } from './phone/DeliveryView';",
    "import { DeliveryView } from './phone/DeliveryView';\nimport { ReceptionView } from './phone/ReceptionView';"
  );
}

// 3. Add the 'recepcao' tab before 'entrega' tab
const tabRoom = `<button
            type="button"
            role="tab"
            aria-selected={view === 'salao'}
            className={view === 'salao' ? 'is-active' : ''}
            onClick={() => setView('salao')}
          >
            🪑 {demo.preview.tabRoom}
          </button>`;

const tabRecepcao = `
          <button
            type="button"
            role="tab"
            aria-selected={view === 'recepcao'}
            className={view === 'recepcao' ? 'is-active' : ''}
            onClick={() => setView('recepcao')}
          >
            🎧 Recepção
            {deliveries.filter(d => d.status === 'novo').length > 0 && <span className="phone__tab-dot" aria-hidden="true" />}
          </button>
`;

content = content.replace(tabRoom, tabRoom + tabRecepcao);

// 4. Update the 'entrega' tab dot logic
// It used to be pendingDeliveries > 0 (which included 'novo').
// Let's redefine pendingDeliveries earlier or just change the dot for entrega.
content = content.replace(
  "{pendingDeliveries > 0 && <span className=\"phone__tab-dot\" aria-hidden=\"true\" />}",
  "{deliveries.filter(d => d.status === 'aceito' || d.status === 'a_caminho').length > 0 && <span className=\"phone__tab-dot\" aria-hidden=\"true\" />}"
);

// 5. Render ReceptionView
const deliveryRender = `{view === 'entrega' && <DeliveryView orders={deliveries} interactive={interactive} onAdvance={advanceDelivery} />}`;
const receptionRender = `{view === 'recepcao' && <ReceptionView deliveries={deliveries} onAccept={(id, fee) => {
            setDeliveries(list => list.map(d => d.id === id ? { ...d, total: d.total + fee, status: 'aceito' } : d));
            showFlash('Pedido despachado para o entregador!');
          }} onReject={(id) => {
            setDeliveries(list => list.filter(d => d.id !== id));
          }} />}`;

content = content.replace(deliveryRender, receptionRender + '\n          ' + deliveryRender);

fs.writeFileSync(file, content, 'utf8');

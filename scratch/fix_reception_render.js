import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'EditorPreview.tsx');
let content = fs.readFileSync(file, 'utf8');

const target = `{view === 'entrega' && (`;

const receptionRender = `
        {view === 'recepcao' && (
          <>
            <ReceptionView 
              deliveries={deliveries} 
              onAccept={(id, fee) => {
                setDeliveries(list => list.map(d => d.id === id ? { ...d, deliveryFee: fee, total: d.total + fee, status: 'aceito' } : d));
                showFlash('Pedido despachado para o entregador!');
              }} 
              onReject={(id) => {
                setDeliveries(list => list.filter(d => d.id !== id));
              }} 
            />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </>
        )}
`;

content = content.replace(target, receptionRender + '\n        ' + target);

fs.writeFileSync(file, content, 'utf8');

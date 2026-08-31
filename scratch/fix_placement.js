import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'EditorPreview.tsx');
let content = fs.readFileSync(file, 'utf8');

// The block that is wrongly placed inside phone__chips
const badBlock = `        {view === 'recepcao' && (
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

content = content.replace(badBlock, ''); // Remove it from where it is

// The block that we want to put inside phone__chips instead (if it makes sense to have a chip for it)
// Let's just leave phone__chips without a 'recepcao' chip, or add a simple one:
const receptionChip = `            {view === 'recepcao' && (
              <>
                <span className="phone__chip phone__chip--on">Central de Pedidos</span>
              </>
            )}
`;

const replaceChips = `            {view === 'entrega' && (`;
content = content.replace(replaceChips, receptionChip + replaceChips);


// Now insert the actual ReceptionView block right before DeliveryView in the main body
const mainDeliveryView = `        {view === 'entrega' && (
          <>
            <DeliveryView orders={deliveries} interactive={interactive} onAdvance={advanceDelivery} />
            {flash && <p className="phone__flash phone__flash--float">{flash}</p>}
          </>
        )}`;

const mainReceptionView = `        {view === 'recepcao' && (
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

content = content.replace(mainDeliveryView, mainReceptionView + '\n' + mainDeliveryView);

fs.writeFileSync(file, content, 'utf8');

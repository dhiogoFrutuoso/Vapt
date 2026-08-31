import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'PhonePreview.tsx');
let content = fs.readFileSync(file, 'utf8');

const oldDeliveryView = `<DeliveryView orders={deliveries} interactive={interactive} onAdvance={advanceDelivery} />`;
const newDeliveryView = `<DeliveryView 
            orders={deliveries} 
            interactive={interactive} 
            onAdvance={advanceDelivery} 
            onRevert={() => {}} 
            onCancel={() => {}} 
          />`;

content = content.replace(oldDeliveryView, newDeliveryView);
fs.writeFileSync(file, content, 'utf8');

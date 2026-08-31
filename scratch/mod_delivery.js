import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'web', 'src', 'components', 'phone', 'DeliveryView.tsx');
let content = fs.readFileSync(file, 'utf8');

// Change pending to exclude 'novo'
content = content.replace(
  "const pending = useMemo(() => orders.filter((order) => order.status !== 'entregue'), [orders]);",
  "const pending = useMemo(() => orders.filter((order) => order.status !== 'entregue' && order.status !== 'novo'), [orders]);"
);

// We should also adjust the comment
content = content.replace(
  "Duas listas que nunca se misturam — \"Em andamento\" (novo, aceito, a caminho)",
  "Duas listas que nunca se misturam — \"Em andamento\" (aceito, a caminho)"
);

fs.writeFileSync(file, content, 'utf8');

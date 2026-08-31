import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'apps', 'api', 'src', 'routes', 'index.ts');
let content = fs.readFileSync(file, 'utf8');

// Add imports
content = content.replace(
  "import {",
  "import { createOrder, getOrders, updateOrderStatus } from '../controllers/orders.controller.js';\nimport {"
);

// Add routes
content += `
// Orders
router.post('/orders', writeLimiter, createOrder);
router.get('/orders', requireAuth, getOrders);
router.patch('/orders/:id/status', requireAuth, writeLimiter, updateOrderStatus);
`;

fs.writeFileSync(file, content, 'utf8');

import { Router } from 'express';
import { adminGuard } from '../middlewares/adminGuard.js';
import { listUsers, impersonateUser } from '../controllers/adminController.js';
import { downloadSubscriptionReceipt, listSubscriptionHistory, receiptUpload, recordSubscriptionInvoice, updateSubscriptionSettings } from '../controllers/subscription.controller.js';
import { publishAppVersion } from '../controllers/appVersion.controller.js';

export const adminRoutes = Router();

adminRoutes.use(adminGuard);
adminRoutes.get('/users', listUsers);
adminRoutes.put('/users/:id/plan', updateSubscriptionSettings);
adminRoutes.get('/users/:id/subscription-history', listSubscriptionHistory);
adminRoutes.post('/users/:id/subscription-invoices', receiptUpload, recordSubscriptionInvoice);
adminRoutes.get('/users/:id/subscription-invoices/:entryId/receipt', downloadSubscriptionReceipt);
adminRoutes.post('/impersonate/:id', impersonateUser);
adminRoutes.put('/app/version', publishAppVersion);

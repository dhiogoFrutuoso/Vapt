import { Router } from 'express';
import { adminGuard } from '../middlewares/adminGuard.js';
import { listUsers, updateUserPlan, impersonateUser } from '../controllers/adminController.js';
import { publishAppVersion } from '../controllers/appVersion.controller.js';

export const adminRoutes = Router();

adminRoutes.use(adminGuard);
adminRoutes.get('/users', listUsers);
adminRoutes.put('/users/:id/plan', updateUserPlan);
adminRoutes.post('/impersonate/:id', impersonateUser);
adminRoutes.put('/app/version', publishAppVersion);

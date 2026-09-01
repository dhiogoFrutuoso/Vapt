import { Router } from 'express';
import { adminGuard } from '../middlewares/adminGuard.js';
import { listUsers } from '../controllers/adminController.js';

export const adminRoutes = Router();

adminRoutes.use(adminGuard);
adminRoutes.get('/users', listUsers);

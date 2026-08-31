import { createOrder, getOrders, updateOrderStatus } from '../controllers/orders.controller.js';
import { Router } from 'express';

import { listPlans } from '../controllers/plans.controller.js';
import { createLead } from '../controllers/leads.controller.js';
import {
  addDemoProduct,
  createDemoStore,
  getDemoStore,
  removeDemoProduct,
} from '../controllers/demo.controller.js';
import { createSupportRequest } from '../controllers/support.controller.js';
import { getCompanyInfo } from '../controllers/company.controller.js';
import {
  checkUsername,
  login,
  logout,
  me,
  register,
  updateMe,
} from '../controllers/auth.controller.js';
import { imageMeta, serveImage } from '../controllers/images.controller.js';
import {
  createApp,
  listApps,
  deleteApp,
  getApp,
  updateApp,
  addCategory,
  updateCategory,
  removeCategory,
  addProduct,
  updateProduct,
  removeProduct,
  addTable,
  updateTable,
  removeTable,
  requestPlan, addRole, updateRole, removeRole, addEmployee, updateEmployee, removeEmployee,
  addPromotion, updatePromotion, removePromotion,
  closeCashRegister
} from '../controllers/apps.controller.js';

import { authLimiter, writeLimiter } from '../middlewares/rateLimiter.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { upload } from '../middlewares/upload.js';

export const router = Router();

/* ---------------------------- Publico ----------------------------- */

router.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'vaptapp-api', uptime: process.uptime() })
);

router.get('/company', getCompanyInfo);
router.get('/plans', listPlans);

/* ------------------------- Landing page --------------------------- */

router.post('/leads', writeLimiter, createLead);

router.post('/demo/stores', writeLimiter, createDemoStore);
router.get('/demo/stores/:code', getDemoStore);
router.post('/demo/stores/:code/products', writeLimiter, addDemoProduct);
router.delete('/demo/stores/:code/products/:productId', removeDemoProduct);

router.post('/support/requests', writeLimiter, createSupportRequest);

/* --------------------------- Imagens ------------------------------ */
/* WEBP em base64 no MongoDB, servido como binario com cache. */

router.get('/images/:id', serveImage);
router.get('/images/:id/meta', imageMeta);

/* ------------------------ Autenticacao ---------------------------- */

router.post('/auth/register', authLimiter, upload.single('photo'), register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/logout', logout);
router.get('/auth/check-username', checkUsername);
router.get('/auth/me', requireAuth, me);
router.patch('/auth/me', requireAuth, updateMe);

/* ------------------------ Aplicativos ----------------------------- */

router.post('/apps', requireAuth, writeLimiter, createApp);
router.get('/apps', requireAuth, listApps);
router.delete('/apps/:id', requireAuth, writeLimiter, deleteApp);
router.get('/apps/:id', requireAuth, getApp);
router.patch('/apps/:id', requireAuth, writeLimiter, updateApp);
router.post('/apps/:id/categories', requireAuth, writeLimiter, addCategory);
router.patch('/apps/:id/categories/:categoryId', requireAuth, writeLimiter, updateCategory);
router.delete('/apps/:id/categories/:categoryId', requireAuth, removeCategory);
router.post('/apps/:id/products', requireAuth, writeLimiter, addProduct);
router.patch('/apps/:id/products/:productId', requireAuth, writeLimiter, updateProduct);
router.delete('/apps/:id/products/:productId', requireAuth, removeProduct);
router.post('/apps/:id/tables', requireAuth, writeLimiter, addTable);
router.patch('/apps/:id/tables/:tableId', requireAuth, writeLimiter, updateTable);
router.delete('/apps/:id/tables/:tableId', requireAuth, removeTable);
router.post('/apps/:id/plan', requireAuth, writeLimiter, requestPlan);


router.post('/apps/:id/roles', requireAuth, writeLimiter, addRole);
router.patch('/apps/:id/roles/:roleId', requireAuth, writeLimiter, updateRole);
router.delete('/apps/:id/roles/:roleId', requireAuth, writeLimiter, removeRole);

router.post('/apps/:id/employees', requireAuth, writeLimiter, addEmployee);
router.patch('/apps/:id/employees/:empId', requireAuth, writeLimiter, updateEmployee);
router.delete('/apps/:id/employees/:empId', requireAuth, writeLimiter, removeEmployee);

router.post('/apps/:id/promotions', requireAuth, writeLimiter, addPromotion);
router.patch('/apps/:id/promotions/:promoId', requireAuth, writeLimiter, updatePromotion);
router.delete('/apps/:id/promotions/:promoId', requireAuth, writeLimiter, removePromotion);

router.post('/apps/:id/cash/close', requireAuth, writeLimiter, closeCashRegister);

// Orders
router.post('/orders', writeLimiter, createOrder);
router.get('/orders', requireAuth, getOrders);
router.patch('/orders/:id/status', requireAuth, writeLimiter, updateOrderStatus);

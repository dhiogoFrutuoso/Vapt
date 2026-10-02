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
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
  updateMe,
  updatePassword,
} from '../controllers/auth.controller.js';
import {
  googleCallback,
  googleStart,
  googleStatus,
} from '../controllers/googleAuth.controller.js';
import {
  deviceLogin,
  deviceLogout,
  deviceMe,
  deviceRefresh,
  deviceSessions,
  deviceUpdateProfile,
} from '../controllers/deviceAuth.controller.js';
import { imageMeta, serveImage } from '../controllers/images.controller.js';
import {
  blockEmployee,
  listEmployees,
  regenerateEmployeeCode,
  unblockEmployee,
} from '../controllers/employees.controller.js';
import { createMagicLink, createPublicOrder, getPublicApp } from '../controllers/publicApp.controller.js';
import { consumeMagicLink } from '../controllers/magicLink.controller.js';
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
  addStation,
  updateStation,
  removeStation,
  addTable,
  updateTable,
  removeTable,
  requestPlan, addRole, updateRole, removeRole, addEmployee, updateEmployee, removeEmployee,
  addPromotion, updatePromotion, removePromotion,
  closeCashRegister
} from '../controllers/apps.controller.js';

import { authLimiter, writeLimiter } from '../middlewares/rateLimiter.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireAppPlan } from '../middlewares/requireAppPlan.js';
import { requireDevice, requirePermission } from '../middlewares/requireDevice.js';
import {
  getOperation,
  runOperationCommand,
} from '../controllers/operation.controller.js';
import { getDeviceMenu, setDeviceProductAvailability } from '../controllers/deviceMenu.controller.js';
import { listDeviceTeam, updateDeviceEmployee } from '../controllers/deviceTeam.controller.js';
import { upload } from '../middlewares/upload.js';
import { adminRoutes } from './adminRoutes.js';
import { getPublicAppVersion } from '../controllers/appVersion.controller.js';
import { getNativeBuild, requestNativeBuild, requireBuildWorker, claimNativeBuild, completeNativeBuild } from '../controllers/nativeBuild.controller.js';

export const router = Router();

router.get('/device/native-build', requireDevice, getNativeBuild);
router.post('/device/native-build', requireDevice, writeLimiter, requestNativeBuild);
router.post('/internal/native-build/claim', requireBuildWorker, claimNativeBuild);
router.post('/internal/native-build/complete', requireBuildWorker, completeNativeBuild);

/* ---------------------------- Publico ----------------------------- */

router.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'vaptapp-api', uptime: process.uptime() })
);

router.get('/company', getCompanyInfo);
router.get('/plans', listPlans);
router.get('/public/app/version', getPublicAppVersion);

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

/* Recuperacao de senha: authLimiter (5 tentativas / 15 min) nas duas pontas.
   Gerar codigo em rajada vira spam no e-mail da vitima; adivinhar codigo em
   rajada quebra 6 digitos em minutos. */
router.post('/auth/forgot-password', authLimiter, forgotPassword);
router.post('/auth/reset-password', authLimiter, resetPassword);
router.get('/auth/me', requireAuth, me);

/* --- Google OAuth 2.0 ---
   Sao navegacoes do navegador (302), nao chamadas XHR: por isso GET e sem
   authLimiter no callback — o Google e quem dispara, e um 429 ali deixaria o
   lojista preso numa tela de erro do proprio Google. */
router.get('/auth/google/status', googleStatus);
router.get('/auth/google', authLimiter, googleStart);
router.get('/auth/google/callback', googleCallback);
router.patch('/auth/me', requireAuth, updateMe);
/* Troca de senha: authLimiter porque exige a senha atual e e alvo de forca bruta. */
router.patch('/auth/password', requireAuth, authLimiter, updatePassword);

/* ---------------------- Cardapio publico --------------------------- */
/* Sem autenticacao: e o link que o cliente final abre. A resposta e montada
   por lista branca no controller — employees, roles e tracking nunca saem. */
router.get('/public/apps/:id', getPublicApp);
/* Assina o rascunho do pedido. Recebe id e quantidade; os precos vem do
   cardapio no banco, nunca do corpo da requisicao. */
router.post('/public/apps/:id/magic-link', writeLimiter, createMagicLink);
router.post('/public/apps/:id/orders', writeLimiter, createPublicOrder);

/* Magic link: o restaurante clica no link que veio no WhatsApp e o pedido
   entra no banco. Sem authLimiter — quem chega e o dono, uma vez por pedido,
   e um 429 aqui perderia o pedido do cliente. A defesa e a assinatura HMAC. */
router.get('/parse', consumeMagicLink);

/* --------------------- Sessao do app da equipe --------------------- */
/* Bearer token, nao cookie: a WebView do Capacitor roda em outra origem.
   O login por codigo entra na Etapa 2; aqui esta o que sustenta a sessao. */

/* O refresh nao usa authLimiter: um app legitimo renova a cada 10 minutos e
   seria bloqueado junto com o atacante. A protecao aqui e a rotacao — token
   reapresentado queima a linhagem inteira. */
/* Login por codigo: authLimiter porque o codigo tem 6 caracteres e e alvo
   natural de tentativa em rajada. */
router.post('/device/login', authLimiter, deviceLogin);
router.patch('/device/profile', requireDevice, deviceUpdateProfile);
router.post('/device/refresh', deviceRefresh);
router.post('/device/logout', deviceLogout);
router.get('/device/me', requireDevice, deviceMe);
router.get('/device/sessions', requireDevice, deviceSessions);

/*
 * Operacao do restaurante: mesas, retiradas, entregas, caixa e cozinha.
 *
 * A leitura devolve o estado inteiro, e o POST recebe UM comando por vez. A
 * autorizacao por comando fica dentro do controlador, numa tabela unica —
 * espalhar `requirePermission` por vinte e duas rotas faria a auditoria de
 * "quem pode o que" depender de ler o arquivo de rotas inteiro.
 *
 * O comando NAO passa pelo `writeLimiter`: o limite de escrita foi calibrado
 * para cadastro, e um garcom lancando itens numa mesa cheia dispara dezenas
 * de comandos em poucos minutos. O `apiLimiter` geral continua valendo.
 */
router.get('/device/menu', requireDevice, getDeviceMenu);
router.patch('/device/menu/products/:productId/availability', requireDevice, setDeviceProductAvailability);
router.get('/device/team', requireDevice, requirePermission('administracao'), listDeviceTeam);
router.patch('/device/team/employees/:empId', requireDevice, requirePermission('administracao'), updateDeviceEmployee);
router.get('/device/operation', requireDevice, getOperation);
router.post('/device/operation', requireDevice, runOperationCommand);

/* ------------------------ Aplicativos ----------------------------- */

router.post('/apps', requireAuth, writeLimiter, createApp);
router.get('/apps', requireAuth, listApps);
router.delete('/apps/:id', requireAuth, writeLimiter, deleteApp);
router.get('/apps/:id', requireAuth, getApp);
router.patch('/apps/:id', requireAuth, requireAppPlan, writeLimiter, updateApp);
router.post('/apps/:id/categories', requireAuth, writeLimiter, addCategory);
router.patch('/apps/:id/categories/:categoryId', requireAuth, writeLimiter, updateCategory);
router.delete('/apps/:id/categories/:categoryId', requireAuth, removeCategory);
router.post('/apps/:id/products', requireAuth, writeLimiter, addProduct);
router.patch('/apps/:id/products/:productId', requireAuth, writeLimiter, updateProduct);
router.delete('/apps/:id/products/:productId', requireAuth, removeProduct);
router.post('/apps/:id/stations', requireAuth, writeLimiter, addStation);
router.patch('/apps/:id/stations/:stationId', requireAuth, writeLimiter, updateStation);
router.delete('/apps/:id/stations/:stationId', requireAuth, removeStation);
router.post('/apps/:id/tables', requireAuth, requireAppPlan, writeLimiter, addTable);
router.patch('/apps/:id/tables/:tableId', requireAuth, requireAppPlan, writeLimiter, updateTable);
router.delete('/apps/:id/tables/:tableId', requireAuth, requireAppPlan, removeTable);
router.post('/apps/:id/plan', requireAuth, requireAppPlan, writeLimiter, requestPlan);

router.post('/apps/:id/roles', requireAuth, writeLimiter, addRole);
router.patch('/apps/:id/roles/:roleId', requireAuth, writeLimiter, updateRole);
router.delete('/apps/:id/roles/:roleId', requireAuth, writeLimiter, removeRole);

router.get('/apps/:id/employees', requireAuth, listEmployees);
router.post('/apps/:id/employees', requireAuth, writeLimiter, addEmployee);
/* Bloqueio e codigo: writeLimiter porque derrubam sessao e emitem credencial. */
router.post('/apps/:id/employees/:empId/block', requireAuth, writeLimiter, blockEmployee);
router.post('/apps/:id/employees/:empId/unblock', requireAuth, writeLimiter, unblockEmployee);
router.post('/apps/:id/employees/:empId/regenerate-code', requireAuth, writeLimiter, regenerateEmployeeCode);
router.patch('/apps/:id/employees/:empId', requireAuth, writeLimiter, updateEmployee);
router.delete('/apps/:id/employees/:empId', requireAuth, writeLimiter, removeEmployee);

router.post('/apps/:id/promotions', requireAuth, writeLimiter, addPromotion);
router.patch('/apps/:id/promotions/:promoId', requireAuth, writeLimiter, updatePromotion);
router.delete('/apps/:id/promotions/:promoId', requireAuth, writeLimiter, removePromotion);

router.post('/apps/:id/cash/close', requireAuth, requireAppPlan, writeLimiter, closeCashRegister);

// Orders
router.post('/orders', writeLimiter, createOrder);
router.get('/orders', requireAuth, getOrders);
router.patch('/orders/:id/status', requireAuth, writeLimiter, updateOrderStatus);

// Admin
router.use('/admin', adminRoutes);

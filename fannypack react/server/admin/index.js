import { Router } from 'express';
import { adminAccount, adminAuth, csrfGuard, loadAdmin, requireAdmin } from './auth.js';
import { dashboard } from './dashboard.js';
import { products } from './products.js';
import { inventory } from './inventory.js';
import { adminOrders } from './orders.js';
import { customers, discounts } from './customers.js';
import { site } from './site.js';
import { reports } from './reports.js';
import { adminUsers } from './users.js';
import { uploads } from './uploads.js';
import { reviews } from './reviews.js';

// Everything under /api/admin. Order matters:
//   1. every request: identify the admin (cookie) + CSRF check for writes
//   2. public admin endpoints: login, 2FA step, logout, forgot/reset password, me
//   3. everything else: signed-in admin (+2FA) required, then per-section permission
export const admin = Router();

admin.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
admin.use(loadAdmin);
admin.use(csrfGuard);
admin.use(adminAuth);

admin.use(requireAdmin);
admin.use(adminAccount);
admin.use(dashboard);
admin.use(products);
admin.use(reviews);
admin.use(inventory);
admin.use(adminOrders);
admin.use(customers);
admin.use(discounts);
admin.use(site);
admin.use(reports);
admin.use(adminUsers);
admin.use('/uploads', (req, _res, next) => {
  const p = req.admin.permissions;
  if (!['products', 'content', 'settings', 'collections'].some((x) => p.includes(x))) {
    throw Object.assign(new Error('You do not have permission to upload files.'), { status: 403 });
  }
  next();
});
admin.use(uploads);
admin.use((_req, res) => res.status(404).json({ error: 'Not found' }));

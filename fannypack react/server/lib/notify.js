import { query } from '../db.js';
import { getSetting } from './settings.js';
import { sendMail } from './mailer.js';

// Which admin permission is needed to see each notification type in the bell
export const NOTIFICATION_PERM = {
  new_order: 'orders', order_cancelled: 'orders', delivered: 'orders',
  payment_received: 'payments', payment_failed: 'payments', payment_attention: 'payments', refund: 'payments',
  low_stock: 'inventory', out_of_stock: 'inventory',
  shipment_created: 'shipping', shipment_error: 'shipping', shipment_delayed: 'shipping',
  integration_failure: 'integrations', webhook_failure: 'integrations',
};

// In-app admin notification (bell icon), optionally also emailed to the store's admin email.
export async function notify({ type, title, body = null, link = null, severity = 'info', email = false }, db = { query }) {
  try {
    await db.query(
      `INSERT INTO admin_notifications (type, title, body, link, severity) VALUES ($1,$2,$3,$4,$5)`,
      [type, title, body, link, severity]
    );
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
  if (email) {
    const n = await getSetting('notifications').catch(() => null);
    // "Email me for every new order" only switches off order emails, never alerts
    const orderMail = type === 'new_order' || type === 'payment_received';
    if (n?.admin_email && (!orderMail || n.email_new_order !== false)) {
      sendMail({ to: n.admin_email, subject: title, text: [body, link ? `${process.env.PUBLIC_URL || ''}${link}` : ''].filter(Boolean).join('\n\n') }).catch(() => {});
    }
  }
}

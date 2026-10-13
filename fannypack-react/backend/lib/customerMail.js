import { query } from '../db.js';
import { getSetting } from './settings.js';
import { sendMail } from './mailer.js';

// Emails to shoppers: order updates, password reset, back-in-stock.
// They never throw: a mail problem must not break an order.

const site = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function storeInfo() {
  const store = await getSetting('store');
  return { name: store.name || 'Bookends Fanny Pack', email: store.contact_email, phone: store.phone };
}

function layout(store, heading, bodyHtml) {
  const contact = [store.email && `<a href="mailto:${esc(store.email)}">${esc(store.email)}</a>`, store.phone && esc(store.phone)].filter(Boolean).join(' · ');
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#fff;border-radius:10px;padding:24px">
<h2 style="margin:0 0 16px;color:#e8281a">${esc(heading)}</h2>
${bodyHtml}
</div>
<p style="font-size:12px;color:#777;text-align:center;margin-top:16px">${esc(store.name)}${contact ? `<br>${contact}` : ''}</p>
</div></body></html>`;
}

const SUBJECT = {
  confirmed: (o) => `Order confirmed: ${o.number}`,
  shipped: (o) => `Your order ${o.number} has shipped`,
  out_for_delivery: (o) => `Out for delivery today: ${o.number}`,
  delivered: (o) => `Delivered: ${o.number}`,
  cancelled: (o) => `Order cancelled: ${o.number}`,
  refunded: (o) => `Refund issued for ${o.number}`,
};

function intro(kind, o, extra) {
  switch (kind) {
    case 'confirmed':
      return o.payment_method === 'cod'
        ? `Thank you for your order! Please keep ${rs(o.total)} ready - you pay in cash when it arrives.`
        : `Thank you for your order! We have received your payment of ${rs(o.total)}.`;
    case 'shipped':
      return `Good news - your order is on its way${o.courier_name ? ` with ${o.courier_name}` : ''}.${o.awb_code ? ` Tracking number (AWB): ${o.awb_code}.` : ''}`;
    case 'out_for_delivery':
      return 'Your order is out for delivery and should reach you today.';
    case 'delivered':
      return 'Your order has been delivered. We hope you enjoy it! You can rate the products from your order page.';
    case 'cancelled':
      return `Your order has been cancelled${extra?.reason ? ` (${extra.reason})` : ''}.${o.payment_status === 'paid' || o.payment_status === 'refunded' ? ' Any amount you paid online will be refunded to the original payment method in 5-7 working days.' : ''}`;
    case 'refunded':
      return `We have issued a refund of ${rs(extra?.amount)} to your original payment method. It usually reaches your account in 5-7 working days.`;
    default:
      return '';
  }
}

// kind: confirmed | shipped | out_for_delivery | delivered | cancelled | refunded
export async function sendOrderEmail(orderId, kind, extra = {}) {
  try {
    const n = await getSetting('notifications');
    if (n?.customer_emails === false || !SUBJECT[kind]) return false;
    const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    const o = rows[0];
    if (!o?.email) return false;
    const { rows: items } = await query(`SELECT name, option, qty, line_total FROM order_items WHERE order_id = $1 ORDER BY id`, [o.id]);
    const store = await storeInfo();
    const link = `${site()}/order/${encodeURIComponent(o.number)}`;
    const first = (o.name || '').split(' ')[0] || 'there';
    const lead = intro(kind, o, extra);

    const lines = items.map((i) => `- ${i.name}${i.option ? ` (${i.option})` : ''} x ${i.qty}: ${rs(i.line_total)}`);
    const totals = [
      `Subtotal: ${rs(o.subtotal)}`,
      o.discount_amount ? `Discount${o.discount_code ? ` (${o.discount_code})` : ''}: -${rs(o.discount_amount)}` : null,
      `Delivery: ${o.delivery ? rs(o.delivery) : 'Free'}`,
      `Total: ${rs(o.total)}`,
    ].filter(Boolean);
    const address = `${o.name}, ${o.address_line}, ${o.city}, ${o.state} - ${o.pin}`;
    const showItems = kind === 'confirmed' || kind === 'cancelled';

    const text = [
      `Hi ${first},`,
      '',
      lead,
      '',
      `Order: ${o.number}`,
      ...(showItems ? ['', ...lines, '', ...totals, '', `Delivering to: ${address}`] : []),
      o.tracking_url && ['shipped', 'out_for_delivery'].includes(kind) ? `Track your parcel: ${o.tracking_url}` : null,
      '',
      `View your order: ${link}`,
      '',
      store.name,
    ].filter((l) => l !== null).join('\n');

    const html = layout(
      store,
      SUBJECT[kind](o),
      `<p>Hi ${esc(first)},</p><p>${esc(lead)}</p>
<p style="margin:16px 0"><strong>Order ${esc(o.number)}</strong></p>
${showItems ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.name)}${i.option ? ` <span style="color:#777">(${esc(i.option)})</span>` : ''} × ${i.qty}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${rs(i.line_total)}</td></tr>`).join('')}</table>
<p style="font-size:14px;line-height:1.7">${totals.map(esc).join('<br>')}</p>
<p style="font-size:14px;color:#555">Delivering to: ${esc(address)}</p>` : ''}
${o.tracking_url && ['shipped', 'out_for_delivery'].includes(kind) ? `<p><a href="${esc(o.tracking_url)}">Track your parcel</a></p>` : ''}
<p style="margin-top:20px"><a href="${esc(link)}" style="background:#e8281a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View your order</a></p>`
    );
    return await sendMail({ to: o.email, subject: SUBJECT[kind](o), text, html });
  } catch (err) {
    console.error(`Order email (${kind}) failed:`, err.message);
    return false;
  }
}

export async function sendPasswordResetEmail(user, link) {
  const store = await storeInfo();
  const text = `Hi ${user.name.split(' ')[0]},\n\nWe received a request to reset the password for your ${store.name} account.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf you did not ask for this, you can ignore this email - your password will not change.\n\n${store.name}`;
  const html = layout(
    store,
    'Reset your password',
    `<p>Hi ${esc(user.name.split(' ')[0])},</p><p>We received a request to reset the password for your ${esc(store.name)} account. This link is valid for 1 hour.</p>
<p style="margin:20px 0"><a href="${esc(link)}" style="background:#e8281a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Choose a new password</a></p>
<p style="font-size:13px;color:#777">If you did not ask for this, you can ignore this email - your password will not change.</p>`
  );
  return sendMail({ to: user.email, subject: `Reset your ${store.name} password`, text, html });
}

// A variant came back in stock: email everyone who asked (once)
export async function sendBackInStockEmails(variantId) {
  try {
    const { rows } = await query(
      `UPDATE stock_alerts SET notified_at = now() WHERE variant_id = $1 AND notified_at IS NULL RETURNING email`,
      [variantId]
    );
    if (!rows.length) return 0;
    const { rows: v } = await query(
      `SELECT v.option, p.slug, COALESCE(p.display_name, p.name) AS name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`,
      [variantId]
    );
    if (!v[0]) return 0;
    const store = await storeInfo();
    const label = `${v[0].name}${v[0].option ? ` (${v[0].option})` : ''}`;
    const link = `${site()}/product/${encodeURIComponent(v[0].slug)}`;
    for (const { email } of rows) {
      await sendMail({
        to: email,
        subject: `Back in stock: ${label}`,
        text: `Good news! ${label} is back in stock at ${store.name}.\n\nOrder now: ${link}\n\n${store.name}`,
        html: layout(store, 'Back in stock', `<p>Good news! <strong>${esc(label)}</strong> is back in stock.</p><p style="margin:20px 0"><a href="${esc(link)}" style="background:#e8281a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Order now</a></p>`),
      }).catch((err) => console.error('Back-in-stock email failed:', err.message));
    }
    return rows.length;
  } catch (err) {
    console.error('Back-in-stock emails failed:', err.message);
    return 0;
  }
}

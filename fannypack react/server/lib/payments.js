import { pool, query, tx } from '../db.js';
import { addHistory } from './orderHistory.js';
import { notify } from './notify.js';
import { restockOrder } from './inventory.js';
import { createRazorpayRefund } from '../integrations/razorpay.js';
import { autoCreateShipment } from './fulfilment.js';
import { sendOrderEmail } from './customerMail.js';

// Idempotent: safe to call from the checkout callback AND the webhook for the same payment.
// Returns { order, changed }.
export async function markOrderPaid({ orderId, razorpayOrderId, paymentId, amountPaise, method = null, raw = null, source }) {
  const result = await tx(async (db) => {
    const { rows } = await db.query(
      orderId
        ? `SELECT * FROM orders WHERE id = $1 FOR UPDATE`
        : `SELECT * FROM orders WHERE razorpay_order_id = $1 FOR UPDATE`,
      [orderId || razorpayOrderId]
    );
    const order = rows[0];
    if (!order) return { order: null, changed: false };

    await db.query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, provider_order_id, amount, status, method, raw)
       VALUES ($1, 'razorpay', $2, $3, $4, 'captured', $5, $6)
       ON CONFLICT (provider, provider_payment_id) DO UPDATE
         SET status = 'captured', method = COALESCE(EXCLUDED.method, payments.method), updated_at = now()`,
      [order.id, paymentId, order.razorpay_order_id, Math.round((amountPaise ?? order.total * 100) / 100), method, raw ? JSON.stringify(raw) : null]
    );

    if (order.payment_status === 'paid' || order.payment_status === 'refunded') return { order, changed: false };

    // The amount captured must be exactly the order total (Razorpay orders are created for that amount)
    if (amountPaise != null && Math.round(Number(amountPaise)) !== order.total * 100) {
      await addHistory(db, order.id, 'payment_mismatch', { note: `Payment ${paymentId}: ₹${Number(amountPaise) / 100} received, order total is ₹${order.total}`, source });
      await notify({ type: 'payment_attention', title: `Payment amount mismatch: ${order.number}`, body: `Received ₹${Number(amountPaise) / 100}, expected ₹${order.total}. Check and refund.`, link: `/admin/orders/${order.number}`, severity: 'critical', email: true }, db);
      return { order, changed: false, mismatch: true };
    }

    if (order.stock_released) {
      // Paid after the reservation expired / order was cancelled: keep the money on record, flag it
      await db.query(
        `UPDATE orders SET razorpay_payment_id = $1, payment_status = 'paid',
                admin_note = trim(both from coalesce(admin_note, '') || ' Paid after reservation expired - check stock / refund.'),
                updated_at = now() WHERE id = $2`,
        [paymentId, order.id]
      );
      await addHistory(db, order.id, 'payment_received_late', { note: `Payment ${paymentId} received after the order expired`, source });
      return { order: { ...order, payment_status: 'paid', razorpay_payment_id: paymentId }, changed: true, expired: true };
    }

    const { rows: up } = await db.query(
      `UPDATE orders SET razorpay_payment_id = $1, payment_status = 'paid', status = 'placed', updated_at = now()
       WHERE id = $2 RETURNING *`,
      [paymentId, order.id]
    );
    await addHistory(db, order.id, 'paid', { note: `Payment ${paymentId}${method ? ` via ${method}` : ''}`, source });
    await notify({ type: 'payment_received', title: `Payment received: ${order.number}`, body: `₹${order.total} from ${order.name}`, link: `/admin/orders/${order.number}`, severity: 'good', email: true }, db);
    return { order: up[0], changed: true };
  });

  // Prepaid order is confirmed: email the customer and start the shipping workflow
  if (result.changed && !result.expired && result.order) {
    sendOrderEmail(result.order.id, 'confirmed');
    autoCreateShipment(result.order.id).catch((err) => console.error('Auto shipment failed:', err.message));
  }
  // Paid after the order had already expired (stock given back): refund automatically
  if (result.expired) {
    refundOrder(result.order.number, { reason: 'Payment received after the order expired', source: 'system' })
      .then(() => notify({ type: 'payment_attention', title: `Late payment refunded: ${result.order.number}`, body: 'The payment arrived after the order expired, so it was refunded automatically.', link: `/admin/orders/${result.order.number}`, severity: 'warning' }))
      .catch((err) => notify({ type: 'payment_attention', title: `Payment after expiry: ${result.order.number}`, body: `Automatic refund failed (${err.message}). Refund it manually.`, link: `/admin/orders/${result.order.number}`, severity: 'critical', email: true }));
  }
  return result;
}

export async function recordPaymentFailure({ razorpayOrderId, paymentId, error, raw, source }) {
  await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE razorpay_order_id = $1 FOR UPDATE`, [razorpayOrderId]);
    const order = rows[0];
    if (!order) return;
    if (paymentId) {
      await db.query(
        `INSERT INTO payments (order_id, provider, provider_payment_id, provider_order_id, amount, status, error, raw)
         VALUES ($1, 'razorpay', $2, $3, $4, 'failed', $5, $6)
         ON CONFLICT (provider, provider_payment_id) DO NOTHING`,
        [order.id, paymentId, razorpayOrderId, order.total, error || null, raw ? JSON.stringify(raw) : null]
      );
    }
    if (order.payment_status === 'paid') return;
    await addHistory(db, order.id, 'payment_failed', { note: error || 'Payment failed', source });
    await notify({ type: 'payment_failed', title: `Payment failed: ${order.number}`, body: error || null, link: `/admin/orders/${order.number}`, severity: 'warning' }, db);
  });
}

// Refund (full or partial). Online orders are refunded through Razorpay; COD refunds are recorded manually.
// One refund per order at a time (a double click must not refund twice): hold an advisory lock.
export async function refundOrder(orderNumber, opts) {
  const lock = await pool.connect();
  try {
    await lock.query(`SELECT pg_advisory_lock(hashtext($1))`, [`refund:${orderNumber}`]);
    return await refundOrderLocked(orderNumber, opts);
  } finally {
    await lock.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`refund:${orderNumber}`]).catch(() => {});
    lock.release();
  }
}

async function refundOrderLocked(orderNumber, { amount, reason, restock = false, admin = null, source = 'admin' }) {
  const { rows } = await query(`SELECT * FROM orders WHERE number = $1`, [orderNumber]);
  const order = rows[0];
  if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
  const { rows: done } = await query(`SELECT COALESCE(sum(amount), 0)::int AS total FROM refunds WHERE order_id = $1 AND status <> 'failed'`, [order.id]);
  const refundable = order.total - done[0].total;
  const amt = Number(amount) || refundable;
  if (!Number.isInteger(amt) || amt <= 0 || amt > refundable) {
    throw Object.assign(new Error(`Refund amount must be between ₹1 and ₹${refundable}.`), { status: 400 });
  }

  let providerRefund = null;
  if (order.payment_method !== 'cod') {
    if (order.payment_status !== 'paid' && order.payment_status !== 'refunded') throw Object.assign(new Error('This order has not been paid online.'), { status: 400 });
    if (!order.razorpay_payment_id) throw Object.assign(new Error('No Razorpay payment id on this order.'), { status: 400 });
    providerRefund = await createRazorpayRefund(order.razorpay_payment_id, amt * 100, { order_number: order.number, reason: reason || '' });
  }

  return tx(async (db) => {
    await db.query(
      `INSERT INTO refunds (order_id, provider, provider_refund_id, payment_id, amount, status, reason, admin_email, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (provider, provider_refund_id) DO NOTHING`,
      [
        order.id,
        providerRefund ? 'razorpay' : 'manual',
        providerRefund ? providerRefund.id : `manual-${order.number}-${Date.now()}`,
        order.razorpay_payment_id,
        amt,
        providerRefund ? providerRefund.status || 'pending' : 'processed',
        reason || null,
        admin?.email || null,
        providerRefund ? JSON.stringify(providerRefund) : null,
      ]
    );
    const full = amt === refundable;
    if (full) {
      await db.query(`UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = $1`, [order.id]);
    }
    if (restock && !order.stock_released) await restockOrder(db, order.id, { source: 'refund', reason: `Refund ${order.number}`, admin });
    await addHistory(db, order.id, full ? 'refunded' : 'partially_refunded', { note: `₹${amt}${reason ? ` - ${reason}` : ''}`, source, adminEmail: admin?.email });
    await notify({ type: 'refund', title: `Refund ${full ? '' : '(partial) '}₹${amt}: ${order.number}`, link: `/admin/orders/${order.number}`, severity: 'info' }, db);
    db.afterCommit(() => sendOrderEmail(order.id, 'refunded', { amount: amt }));
    return { amount: amt, full, providerRefundId: providerRefund?.id || null };
  });
}

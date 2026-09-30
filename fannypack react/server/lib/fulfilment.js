import { query, tx } from '../db.js';
import { addHistory } from './orderHistory.js';
import { notify } from './notify.js';
import { checkServiceable } from './delivery.js';
import { sendOrderEmail } from './customerMail.js';
import {
  assignAwb, createShiprocketOrder, mapShiprocketStatus, requestPickup, shiprocketConfig,
  shiprocketConnected, trackAwb, trackShipment, trackingUrl,
} from '../integrations/shiprocket.js';

const FINAL = ['delivered', 'rto_delivered', 'cancelled', 'lost'];

// Create the Shiprocket order + AWB + pickup for one of our orders.
// Idempotent: an order that already has a Shiprocket order is never sent twice, and a
// "creating" marker stops two requests racing each other.
export async function createShipment(orderId, { admin = null, source = 'admin' } = {}) {
  if (!(await shiprocketConnected())) throw Object.assign(new Error('Shiprocket is not connected.'), { status: 400 });
  const cfg = await shiprocketConfig();
  if (!cfg.pickup_location) throw Object.assign(new Error('Set the Shiprocket pickup location name in Integrations first.'), { status: 400 });

  // Claim the order
  const order = await tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const o = rows[0];
    if (!o) throw Object.assign(new Error('Order not found.'), { status: 404 });
    if (o.shiprocket_order_id) return { ...o, existing: true };
    if (o.status === 'cancelled') throw Object.assign(new Error('Order is cancelled.'), { status: 400 });
    if (o.payment_method !== 'cod' && o.payment_status !== 'paid') throw Object.assign(new Error('Order is not paid yet.'), { status: 400 });
    if (o.fulfilment_status === 'creating' && new Date(o.updated_at) > new Date(Date.now() - 5 * 60000)) {
      throw Object.assign(new Error('A shipment is already being created for this order.'), { status: 409 });
    }
    const svc = await checkServiceable({ state: o.state, pin: o.pin });
    if (!svc.ok) throw Object.assign(new Error(`Address is outside the delivery area: ${svc.message}`), { status: 400 });
    await db.query(`UPDATE orders SET fulfilment_status = 'creating', fulfilment_error = NULL, updated_at = now() WHERE id = $1`, [o.id]);
    return o;
  });
  if (order.existing) return order;

  try {
    const { rows: items } = await query(
      `SELECT oi.name, oi.qty, oi.unit_price, oi.product_id, oi.option,
              v.sku, v.weight_g, v.length_cm, v.width_cm, v.height_cm
       FROM order_items oi
       LEFT JOIN product_variants v ON v.id = COALESCE(oi.variant_id,
         (SELECT x.id FROM product_variants x WHERE x.product_id = oi.product_id AND x.option IS NOT DISTINCT FROM oi.option LIMIT 1))
       WHERE oi.order_id = $1`,
      [order.id]
    );
    const created = await createShiprocketOrder(order, items, cfg);
    const shipmentId = created.shipment_id ? String(created.shipment_id) : null;
    await query(
      `UPDATE orders SET shiprocket_order_id = $1, shipment_id = $2, fulfilment_status = 'created',
              shipment_status = 'processing', status = CASE WHEN status IN ('placed','confirmed') THEN 'processing' ELSE status END,
              updated_at = now() WHERE id = $3`,
      [String(created.order_id), shipmentId, order.id]
    );
    await tx((db) => addHistory(db, order.id, 'shipment_created', { note: `Shiprocket order ${created.order_id}`, source, adminEmail: admin?.email }));

    // AWB + courier
    if (shipmentId && cfg.auto_awb !== false) {
      try {
        const awb = await assignAwb(shipmentId);
        await query(
          `UPDATE orders SET awb_code = $1, courier_name = $2, tracking_url = $3, fulfilment_status = 'awb_assigned', updated_at = now() WHERE id = $4`,
          [awb.awb_code, awb.courier_name || null, trackingUrl(awb.awb_code), order.id]
        );
        await tx((db) => addHistory(db, order.id, 'awb_assigned', { note: `${awb.courier_name || 'Courier'} · AWB ${awb.awb_code}`, source }));
        if (cfg.auto_pickup !== false) {
          try {
            const pickup = await requestPickup(shipmentId);
            await query(`UPDATE orders SET pickup_status = $1, shipment_status = 'pickup_scheduled', updated_at = now() WHERE id = $2`, [
              pickup?.pickup_status ? `scheduled${pickup.pickup_scheduled_date ? ' ' + pickup.pickup_scheduled_date : ''}` : 'requested',
              order.id,
            ]);
          } catch (err) {
            await query(`UPDATE orders SET pickup_status = 'failed', fulfilment_error = $1, updated_at = now() WHERE id = $2`, [`Pickup: ${err.message}`, order.id]);
          }
        }
      } catch (err) {
        await query(`UPDATE orders SET fulfilment_error = $1, updated_at = now() WHERE id = $2`, [`AWB: ${err.message}`, order.id]);
        await notify({ type: 'shipment_error', title: `AWB not assigned: ${order.number}`, body: err.message, link: `/admin/orders/${order.number}`, severity: 'warning' });
      }
    }
    await notify({ type: 'shipment_created', title: `Shipment created: ${order.number}`, link: `/admin/orders/${order.number}`, severity: 'info' });
    return (await query(`SELECT * FROM orders WHERE id = $1`, [order.id])).rows[0];
  } catch (err) {
    await query(`UPDATE orders SET fulfilment_status = 'error', fulfilment_error = $1, updated_at = now() WHERE id = $2`, [err.message, order.id]);
    await notify({ type: 'integration_failure', title: `Shiprocket order failed: ${order.number}`, body: err.message, link: `/admin/orders/${order.number}`, severity: 'critical' });
    throw err;
  }
}

// After payment: create the shipment if auto-create is on (errors are recorded, not thrown)
export async function autoCreateShipment(orderId) {
  if (!(await shiprocketConnected())) return;
  const cfg = await shiprocketConfig();
  if (cfg.auto_create === false) return;
  try {
    await createShipment(orderId, { source: 'system' });
  } catch {
    /* recorded on the order + notification */
  }
}

// Apply one tracking update (from sync or webhook) to an order. Returns true when something changed.
export async function applyTracking(orderId, { statusText, activities = [], etd = null, awb = null, courier = null, source = 'sync', raw = null }) {
  const status = mapShiprocketStatus(statusText);
  return tx(async (db) => {
    const { rows } = await db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const o = rows[0];
    if (!o) return false;

    for (const a of activities) {
      const t = a.date ? new Date(a.date) : null;
      await db.query(
        `INSERT INTO shipment_events (order_id, status, status_code, location, description, event_time, source, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (order_id, status, COALESCE(event_time, 'epoch'::timestamptz)) DO NOTHING`,
        [o.id, a.status || a['sr-status-label'] || 'update', a['sr-status'] != null ? String(a['sr-status']) : null, a.location || null, a.activity || null, t && !isNaN(t) ? t : null, source, JSON.stringify(a)]
      );
    }

    const changed = status && status !== o.shipment_status;
    const nextOrderStatus =
      status === 'delivered' ? 'delivered'
      : ['shipped', 'in_transit', 'out_for_delivery'].includes(status) && !['delivered', 'cancelled'].includes(o.status) ? 'shipped'
      : o.status;
    await db.query(
      `UPDATE orders SET shipment_status = COALESCE($1, shipment_status), status = $2,
              expected_delivery = COALESCE($3::date, expected_delivery),
              awb_code = COALESCE(awb_code, $4), courier_name = COALESCE(courier_name, $5),
              tracking_url = COALESCE(tracking_url, $6), shipping_synced_at = now(),
              fulfilment_status = CASE WHEN $1 IN ('delivered','rto_delivered') THEN 'fulfilled' ELSE fulfilment_status END,
              updated_at = now()
       WHERE id = $7`,
      [status, nextOrderStatus, etd && !isNaN(new Date(etd)) ? new Date(etd) : null, awb, courier, trackingUrl(awb), o.id]
    );
    if (changed) {
      await addHistory(db, o.id, `shipment_${status}`, { note: statusText, source });
      // Customer emails: once when it ships, when it is out for delivery, and when delivered
      const mail =
        nextOrderStatus === 'delivered' && o.status !== 'delivered' ? 'delivered'
        : status === 'out_for_delivery' ? 'out_for_delivery'
        : nextOrderStatus === 'shipped' && o.status !== 'shipped' ? 'shipped'
        : null;
      if (mail) db.afterCommit(() => sendOrderEmail(o.id, mail));
      if (status === 'delivered') await notify({ type: 'delivered', title: `Delivered: ${o.number}`, link: `/admin/orders/${o.number}`, severity: 'good' }, db);
      if (['delayed', 'rto', 'lost'].includes(status)) {
        await notify({ type: 'shipment_delayed', title: `Shipment ${status.replace('_', ' ')}: ${o.number}`, body: statusText, link: `/admin/orders/${o.number}`, severity: 'warning' }, db);
      }
    }
    return Boolean(changed);
  });
}

// Pull the latest tracking from Shiprocket for one order
export async function syncShipment(orderId) {
  const { rows } = await query(`SELECT id, awb_code, shipment_id FROM orders WHERE id = $1`, [orderId]);
  const o = rows[0];
  if (!o) throw Object.assign(new Error('Order not found.'), { status: 404 });
  if (!o.awb_code && !o.shipment_id) throw Object.assign(new Error('This order has no shipment yet.'), { status: 400 });
  const t = o.awb_code ? await trackAwb(o.awb_code) : await trackShipment(o.shipment_id);
  const track = t?.shipment_track?.[0] || {};
  const acts = t?.shipment_track_activities || [];
  const statusText = track.current_status || acts[0]?.['sr-status-label'] || acts[0]?.activity || null;
  await applyTracking(o.id, {
    statusText,
    activities: acts,
    etd: t?.etd || track.edd || null,
    awb: track.awb_code || null,
    courier: track.courier_name || null,
    source: 'sync',
  });
  await query(`UPDATE orders SET shipping_synced_at = now() WHERE id = $1`, [o.id]);
  return (await query(`SELECT * FROM orders WHERE id = $1`, [o.id])).rows[0];
}

// Background job: refresh every active shipment
export async function syncActiveShipments() {
  if (!(await shiprocketConnected())) return 0;
  const { rows } = await query(
    `SELECT id FROM orders
     WHERE (awb_code IS NOT NULL OR shipment_id IS NOT NULL)
       AND COALESCE(shipment_status, '') <> ALL($1::text[])
       AND status <> 'cancelled'
       AND (shipping_synced_at IS NULL OR shipping_synced_at < now() - interval '25 minutes')
     ORDER BY shipping_synced_at NULLS FIRST LIMIT 50`,
    [FINAL]
  );
  let n = 0;
  for (const { id } of rows) {
    try {
      await syncShipment(id);
      n += 1;
    } catch (err) {
      await query(`UPDATE orders SET fulfilment_error = $1, shipping_synced_at = now() WHERE id = $2`, [`Tracking: ${err.message}`, id]);
    }
  }
  return n;
}

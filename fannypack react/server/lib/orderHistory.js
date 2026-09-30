// Order timeline entries (order_status_history)
export async function addHistory(db, orderId, status, { note = null, source = 'system', adminEmail = null } = {}) {
  await db.query(
    `INSERT INTO order_status_history (order_id, status, note, source, admin_email) VALUES ($1,$2,$3,$4,$5)`,
    [orderId, status, note, source, adminEmail]
  );
}

// Customer-facing tracking steps, derived from the order + shipment state
export function trackingSteps(order) {
  const paid = order.payment_status === 'paid' || order.payment_method === 'cod';
  const ship = (order.shipment_status || '').toLowerCase();
  const shipped = ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(ship) || ['shipped', 'delivered'].includes(order.status);
  const ofd = ship === 'out_for_delivery' || ship === 'delivered' || order.status === 'delivered';
  const delivered = ship === 'delivered' || order.status === 'delivered';
  const processing = shipped || ['processing', 'confirmed'].includes(order.status) || Boolean(order.shiprocket_order_id);
  return [
    { key: 'confirmed', label: 'Order Confirmed', done: order.status !== 'pending_payment' && order.status !== 'cancelled' },
    { key: 'payment', label: order.payment_method === 'cod' ? 'Cash on Delivery' : 'Payment Confirmed', done: paid },
    { key: 'processing', label: 'Processing', done: processing },
    { key: 'shipped', label: 'Shipped', done: shipped },
    { key: 'out_for_delivery', label: 'Out for Delivery', done: ofd },
    { key: 'delivered', label: 'Delivered', done: delivered },
  ];
}

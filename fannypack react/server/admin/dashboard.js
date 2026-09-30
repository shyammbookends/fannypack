import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { dateRange, SALE_WHERE } from './util.js';
import { NOTIFICATION_PERM } from '../lib/notify.js';

export const dashboard = Router();

const TZ = `'Asia/Kolkata'`;

// Sales + orders per hour/day/month, zero-filled
async function series(range, extraWhere = '', params = []) {
  const unit = range.bucket; // hour | day | month (validated in dateRange)
  const { rows } = await query(
    `WITH g AS (
       SELECT generate_series(
         date_trunc('${unit}', $1::timestamptz AT TIME ZONE ${TZ}),
         date_trunc('${unit}', ($2::timestamptz - interval '1 second') AT TIME ZONE ${TZ}),
         interval '1 ${unit}') AS b
     ), s AS (
       SELECT date_trunc('${unit}', o.created_at AT TIME ZONE ${TZ}) AS b,
              sum(o.total)::int AS revenue, count(*)::int AS orders,
              count(DISTINCT o.user_id)::int AS customers
       FROM orders o
       WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2 ${extraWhere}
       GROUP BY 1
     )
     SELECT to_char(g.b, 'YYYY-MM-DD"T"HH24:MI') AS t, COALESCE(s.revenue, 0) AS revenue,
            COALESCE(s.orders, 0) AS orders, COALESCE(s.customers, 0) AS customers
     FROM g LEFT JOIN s ON s.b = g.b ORDER BY g.b`,
    [range.from, range.to, ...params]
  );
  return rows;
}

async function totals(from, to) {
  const { rows } = await query(
    `SELECT COALESCE(sum(o.total), 0)::int AS revenue, count(*)::int AS orders,
            COALESCE(round(avg(o.total)), 0)::int AS aov,
            COUNT(DISTINCT o.user_id)::int AS customers,
            COALESCE(sum(o.discount_amount), 0)::int AS discounts,
            COALESCE(sum(o.delivery), 0)::int AS shipping
     FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2`,
    [from, to]
  );
  return rows[0];
}

async function byProduct(range, limit = 10) {
  const { rows } = await query(
    `SELECT i.product_id, max(i.name) AS name, sum(i.qty)::int AS qty, sum(i.line_total)::int AS revenue
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2
     GROUP BY i.product_id ORDER BY revenue DESC LIMIT ${Number(limit)}`,
    [range.from, range.to]
  );
  return rows;
}

async function byCollection(range) {
  const { rows } = await query(
    `SELECT c.id, COALESCE(c.display_name, c.name) AS name, sum(i.qty)::int AS qty, sum(i.line_total)::int AS revenue
     FROM order_items i JOIN orders o ON o.id = i.order_id
     JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
     WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2
     GROUP BY c.id ORDER BY revenue DESC`,
    [range.from, range.to]
  );
  return rows;
}

dashboard.get('/dashboard', requirePerm('dashboard'), async (req, res) => {
  const range = dateRange(req);
  const [cards, s, products, collections, pay, ship, recent] = await Promise.all([
    query(
      `SELECT
         (SELECT COALESCE(sum(o.total),0)::int FROM orders o WHERE ${SALE_WHERE}) AS total_sales,
         (SELECT COALESCE(sum(o.total),0)::int FROM orders o WHERE ${SALE_WHERE}
            AND o.created_at >= date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ}) AS today_sales,
         (SELECT COALESCE(sum(o.total),0)::int FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2) AS range_sales,
         (SELECT count(*)::int FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2) AS range_orders,
         (SELECT count(*)::int FROM orders o WHERE o.status IN ('placed','confirmed','processing')) AS pending_orders,
         (SELECT count(*)::int FROM orders o WHERE o.status = 'delivered' AND o.updated_at >= $1 AND o.updated_at < $2) AS delivered_orders,
         (SELECT count(*)::int FROM orders o WHERE o.status = 'shipped') AS pending_deliveries,
         (SELECT count(*)::int FROM users u WHERE u.admin_role IS NULL) AS customers,
         (SELECT count(*)::int FROM products p WHERE p.status = 'active' AND p.active) AS products,
         (SELECT count(*)::int FROM product_variants v JOIN products p ON p.id = v.product_id
            WHERE v.track_inventory AND v.stock <= v.low_stock_threshold AND p.status <> 'archived') AS low_stock`,
      [range.from, range.to]
    ),
    series(range),
    byProduct(range, 8),
    byCollection(range),
    query(
      `SELECT o.payment_status AS key, count(*)::int AS n FROM orders o
       WHERE o.created_at >= $1 AND o.created_at < $2 AND o.status <> 'pending_payment'
       GROUP BY 1 ORDER BY 2 DESC`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(o.shipment_status, CASE WHEN o.status = 'cancelled' THEN 'cancelled' ELSE 'not_shipped' END) AS key, count(*)::int AS n
       FROM orders o WHERE o.created_at >= $1 AND o.created_at < $2 AND o.status <> 'pending_payment'
       GROUP BY 1 ORDER BY 2 DESC`,
      [range.from, range.to]
    ),
    query(
      `SELECT number, name, total, status, payment_status, payment_method, created_at FROM orders
       WHERE status <> 'pending_payment' ORDER BY created_at DESC LIMIT 6`
    ),
  ]);
  res.json({
    range: { from: range.from, to: range.to, bucket: range.bucket },
    cards: cards.rows[0],
    series: s,
    byProduct: products,
    byCollection: collections,
    paymentStatus: pay.rows,
    shippingStatus: ship.rows,
    recentOrders: recent.rows,
  });
});

dashboard.get('/analytics', requirePerm('analytics'), async (req, res) => {
  const range = dateRange(req);
  const len = range.to - range.from;
  const prevFrom = new Date(range.from.getTime() - len);
  const [cur, prev, s, products, collections, cust, refunds] = await Promise.all([
    totals(range.from, range.to),
    totals(prevFrom, range.from),
    series(range),
    byProduct(range, 20),
    byCollection(range),
    query(
      `WITH firsts AS (
         SELECT o.user_id, min(o.created_at) AS first_at FROM orders o WHERE ${SALE_WHERE} GROUP BY o.user_id
       )
       SELECT
         count(*) FILTER (WHERE f.first_at >= $1 AND f.first_at < $2)::int AS new_customers,
         count(*) FILTER (WHERE f.first_at < $1 AND EXISTS (
           SELECT 1 FROM orders o WHERE o.user_id = f.user_id AND ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2))::int AS returning_customers
       FROM firsts f`,
      [range.from, range.to]
    ),
    query(
      `SELECT COALESCE(sum(amount),0)::int AS amount, count(*)::int AS n FROM refunds
       WHERE status <> 'failed' AND created_at >= $1 AND created_at < $2`,
      [range.from, range.to]
    ),
  ]);
  res.json({
    range: { from: range.from, to: range.to, bucket: range.bucket },
    current: { ...cur, ...cust.rows[0], refunds: refunds.rows[0].amount, refund_count: refunds.rows[0].n },
    previous: prev,
    series: s,
    byProduct: products,
    byCollection: collections,
    notes: {
      conversion: 'Conversion rate needs visitor tracking, which is not installed, so it is not shown.',
      paymentFees: 'Razorpay fees are not reported to the store yet; see your Razorpay dashboard.',
    },
  });
});

// Command/search bar: orders, products, customers
dashboard.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orders: [], products: [], customers: [] });
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const perms = req.admin.permissions;
  const [o, p, c] = await Promise.all([
    perms.includes('orders')
      ? query(`SELECT number, name, total, status FROM orders WHERE number ILIKE $1 OR email ILIKE $1 OR name ILIKE $1 OR phone ILIKE $1 OR awb_code ILIKE $1 ORDER BY created_at DESC LIMIT 6`, [like])
      : { rows: [] },
    perms.includes('products')
      ? query(`SELECT id, slug, COALESCE(display_name, name) AS name, status FROM products WHERE COALESCE(display_name, name) ILIKE $1 OR slug ILIKE $1 OR id ILIKE $1 LIMIT 6`, [like])
      : { rows: [] },
    perms.includes('customers')
      ? query(`SELECT id, name, email, phone FROM users WHERE admin_role IS NULL AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1) LIMIT 6`, [like])
      : { rows: [] },
  ]);
  res.json({ orders: o.rows, products: p.rows, customers: c.rows });
});

// Bell icon
// Notification types this admin may see (types without a mapping are visible to everyone)
function hiddenTypes(req) {
  return Object.entries(NOTIFICATION_PERM).filter(([, perm]) => !req.admin.permissions.includes(perm)).map(([type]) => type);
}

dashboard.get('/notifications', async (req, res) => {
  const hidden = hiddenTypes(req);
  const [list, unread] = await Promise.all([
    query(`SELECT * FROM admin_notifications WHERE type <> ALL($1::text[]) ORDER BY created_at DESC LIMIT 30`, [hidden]),
    query(`SELECT count(*)::int AS n FROM admin_notifications WHERE read_at IS NULL AND type <> ALL($1::text[])`, [hidden]),
  ]);
  res.json({ items: list.rows, unread: unread.rows[0].n });
});

dashboard.post('/notifications/read', async (req, res) => {
  const hidden = hiddenTypes(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids?.length) await query(`UPDATE admin_notifications SET read_at = now() WHERE id = ANY($1::bigint[]) AND read_at IS NULL AND type <> ALL($2::text[])`, [ids, hidden]);
  else await query(`UPDATE admin_notifications SET read_at = now() WHERE read_at IS NULL AND type <> ALL($1::text[])`, [hidden]);
  res.json({ ok: true });
});

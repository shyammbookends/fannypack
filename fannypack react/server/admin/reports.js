import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm } from './auth.js';
import { audit } from '../lib/audit.js';
import { dateRange, SALE_WHERE, sendCsv } from './util.js';

export const reports = Router();

const TZ = `'Asia/Kolkata'`;
const d = (col) => `to_char(${col} AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI')`;

// Each report: columns + SQL over [$1, $2)
const REPORTS = {
  sales_daily: {
    title: 'Daily sales',
    columns: ['Date', 'Orders', 'Items', 'Subtotal', 'Discounts', 'Shipping', 'Tax', 'Total'],
    sql: `WITH o AS (
            SELECT o.*, (SELECT COALESCE(sum(i.qty), 0) FROM order_items i WHERE i.order_id = o.id) AS items
            FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2
          )
          SELECT to_char(date_trunc('day', o.created_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD'), count(*), sum(o.items),
                 sum(o.subtotal), sum(o.discount_amount), sum(o.delivery), sum(o.tax_amount), sum(o.total)
          FROM o GROUP BY 1 ORDER BY 1`,
  },
  sales_weekly: {
    title: 'Weekly sales',
    columns: ['Week starting', 'Orders', 'Subtotal', 'Discounts', 'Shipping', 'Total'],
    sql: `SELECT to_char(date_trunc('week', o.created_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD'), count(*), sum(o.subtotal),
                 sum(o.discount_amount), sum(o.delivery), sum(o.total)
          FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2 GROUP BY 1 ORDER BY 1`,
  },
  sales_monthly: {
    title: 'Monthly sales',
    columns: ['Month', 'Orders', 'Subtotal', 'Discounts', 'Shipping', 'Total'],
    sql: `SELECT to_char(date_trunc('month', o.created_at AT TIME ZONE ${TZ}), 'YYYY-MM'), count(*), sum(o.subtotal),
                 sum(o.discount_amount), sum(o.delivery), sum(o.total)
          FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2 GROUP BY 1 ORDER BY 1`,
  },
  orders: {
    title: 'Order lines',
    columns: ['Order ID', 'Customer', 'Email', 'Product', 'Option', 'Quantity', 'Unit price', 'Line total', 'Order subtotal', 'Discount', 'Shipping', 'Tax', 'Order total', 'Payment method', 'Payment status', 'Order status', 'Shipment status', 'AWB', 'Date'],
    sql: `SELECT o.number, o.name, o.email, i.name, i.option, i.qty, i.unit_price, i.line_total, o.subtotal, o.discount_amount,
                 o.delivery, o.tax_amount, o.total, o.payment_method, o.payment_status, o.status, o.shipment_status, o.awb_code, ${d('o.created_at')}
          FROM orders o JOIN order_items i ON i.order_id = o.id
          WHERE o.status <> 'pending_payment' AND o.created_at >= $1 AND o.created_at < $2 ORDER BY o.created_at DESC, i.id`,
  },
  products: {
    title: 'Product sales',
    columns: ['Product', 'Option', 'SKU', 'Units sold', 'Revenue', 'Orders'],
    sql: `SELECT i.name, i.option, max(v.sku), sum(i.qty), sum(i.line_total), count(DISTINCT o.id)
          FROM order_items i JOIN orders o ON o.id = i.order_id
          LEFT JOIN product_variants v ON v.id = COALESCE(i.variant_id,
            (SELECT x.id FROM product_variants x WHERE x.product_id = i.product_id AND x.option IS NOT DISTINCT FROM i.option LIMIT 1))
          WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2
          GROUP BY i.name, i.option ORDER BY sum(i.line_total) DESC`,
  },
  collections: {
    title: 'Collection sales',
    columns: ['Collection', 'Units sold', 'Revenue', 'Orders'],
    sql: `SELECT COALESCE(c.display_name, c.name), sum(i.qty), sum(i.line_total), count(DISTINCT o.id)
          FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id
          WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2 GROUP BY c.id ORDER BY sum(i.line_total) DESC`,
  },
  customers: {
    title: 'Customer sales',
    columns: ['Customer', 'Email', 'Phone', 'Orders', 'Total spent', 'First order', 'Last order'],
    sql: `SELECT max(o.name), max(o.email), max(o.phone), count(*), sum(o.total), ${d('min(o.created_at)')}, ${d('max(o.created_at)')}
          FROM orders o WHERE ${SALE_WHERE} AND o.created_at >= $1 AND o.created_at < $2
          GROUP BY COALESCE(o.user_id::text, o.email) ORDER BY sum(o.total) DESC`,
  },
  payments: {
    title: 'Payments',
    columns: ['Order ID', 'Provider', 'Payment ID', 'Method', 'Amount', 'Status', 'Error', 'Date'],
    sql: `SELECT o.number, p.provider, p.provider_payment_id, p.method, p.amount, p.status, p.error, ${d('p.created_at')}
          FROM payments p LEFT JOIN orders o ON o.id = p.order_id WHERE p.created_at >= $1 AND p.created_at < $2 ORDER BY p.created_at DESC`,
  },
  refunds: {
    title: 'Refunds',
    columns: ['Order ID', 'Provider', 'Refund ID', 'Amount', 'Status', 'Reason', 'By', 'Date'],
    sql: `SELECT o.number, r.provider, r.provider_refund_id, r.amount, r.status, r.reason, r.admin_email, ${d('r.created_at')}
          FROM refunds r LEFT JOIN orders o ON o.id = r.order_id WHERE r.created_at >= $1 AND r.created_at < $2 ORDER BY r.created_at DESC`,
  },
  shipping: {
    title: 'Shipping',
    columns: ['Order ID', 'Customer', 'City', 'PIN', 'Courier', 'AWB', 'Shiprocket order', 'Shipment status', 'Pickup', 'Expected delivery', 'Shipping charged', 'Date'],
    sql: `SELECT o.number, o.name, o.city, o.pin, o.courier_name, o.awb_code, o.shiprocket_order_id, o.shipment_status, o.pickup_status,
                 o.expected_delivery, o.delivery, ${d('o.created_at')}
          FROM orders o WHERE (o.shiprocket_order_id IS NOT NULL OR o.awb_code IS NOT NULL) AND o.created_at >= $1 AND o.created_at < $2
          ORDER BY o.created_at DESC`,
  },
  delivery: {
    title: 'Deliveries',
    columns: ['Order ID', 'Customer', 'City', 'Courier', 'AWB', 'Status', 'Delivered / last update'],
    sql: `SELECT o.number, o.name, o.city, o.courier_name, o.awb_code, COALESCE(o.shipment_status, o.status), ${d('o.updated_at')}
          FROM orders o WHERE o.status IN ('shipped','delivered') AND o.created_at >= $1 AND o.created_at < $2 ORDER BY o.updated_at DESC`,
  },
};

reports.get('/reports', requirePerm('reports'), (_req, res) => {
  res.json(Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title })));
});

reports.get('/reports/:key', requirePerm('reports'), async (req, res) => {
  const r = REPORTS[req.params.key];
  if (!r) return res.status(404).json({ error: 'Unknown report.' });
  const range = dateRange(req);
  const { rows } = await query({ text: r.sql, values: [range.from, range.to], rowMode: 'array' });
  if (req.query.format === 'csv') {
    await audit(req, 'report.export', 'report', req.params.key, null, { range: range.key, rows: rows.length });
    return sendCsv(res, `fannypack-${req.params.key}-${range.from.toISOString().slice(0, 10)}.csv`, r.columns, rows);
  }
  res.json({ title: r.title, columns: r.columns, rows: rows.slice(0, 500), total: rows.length });
});

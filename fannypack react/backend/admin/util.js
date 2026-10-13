// Shared helpers for admin routes

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

export function paging(req, { max = 100, def = 25 } = {}) {
  const pageSize = Math.min(max, Math.max(1, parseInt(req.query.pageSize, 10) || def));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// India time (store timezone)
const IST_MS = 330 * 60 * 1000;
const istMidnight = (d) => {
  const t = new Date(d.getTime() + IST_MS);
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - IST_MS);
};

// ?range=today|yesterday|7d|30d|90d|year|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
// -> { from, to, bucket } where to is exclusive
export function dateRange(req) {
  const now = new Date();
  const today = istMidnight(now);
  const day = 86400000;
  const r = String(req.query.range || '30d');
  let from;
  let to = new Date(today.getTime() + day);
  if (r === 'today') from = today;
  else if (r === 'yesterday') {
    from = new Date(today.getTime() - day);
    to = today;
  } else if (r === '7d') from = new Date(today.getTime() - 6 * day);
  else if (r === '90d') from = new Date(today.getTime() - 89 * day);
  else if (r === 'year') {
    const y = new Date(now.getTime() + IST_MS).getUTCFullYear();
    from = new Date(Date.UTC(y, 0, 1) - IST_MS);
  } else if (r === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) {
    from = new Date(new Date(`${req.query.from}T00:00:00Z`).getTime() - IST_MS);
    to = new Date(new Date(`${req.query.to}T00:00:00Z`).getTime() - IST_MS + day);
    if (to <= from) throw new HttpError(400, 'The end date must be after the start date.');
  } else from = new Date(today.getTime() - 29 * day);
  const days = Math.round((to - from) / day);
  const bucket = days <= 2 ? 'hour' : days <= 120 ? 'day' : 'month';
  return { from, to, bucket, days, key: r };
}

// Orders that count as sales: paid online or placed as COD, and not cancelled
export const SALE_WHERE = `o.payment_status IN ('paid','cod','refunded') AND o.status <> 'cancelled'`;

// CSV with a BOM so Excel opens it with the right encoding
export function toCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formula injection in Excel
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}

export function sendCsv(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}

export const str = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max));
export const int = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
export const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

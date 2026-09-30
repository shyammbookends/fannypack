import { query } from '../db.js';

// Store settings live in the existing "settings" table (key -> jsonb).
// Every key has defaults here so the site works before anything is saved.
export const DEFAULTS = {
  store: {
    name: 'Bookends Fanny Pack',
    logo: '/img/logo.png',
    favicon: '/favicon.ico',
    contact_email: 'shyamm.bookends@gmail.com',
    phone: '',
    currency: 'INR',
    tax_inclusive: true,
    default_tax_rate: 0,
    store_open: true,
    closed_message: 'We are not taking orders right now. Please check back soon.',
    cod_enabled: true,
    order_notes: '',
    // Business & legal details (footer, contact page, invoices). Empty = not shown.
    legal_name: '',
    address: '',
    gstin: '',
    fssai: '',
    grievance_officer: '',
    grievance_email: '',
    grievance_phone: '',
    support_hours: '',
  },
  shipping: { fee: 0, free_above: 0 },
  delivery: {
    gujarat_only: true,
    allowed_states: ['Gujarat'],
    allowed_pincodes: [],
    blocked_pincodes: [],
    message: 'Sorry, we currently deliver only within Gujarat.',
  },
  notifications: { admin_email: 'shyamm.bookends@gmail.com', email_new_order: true, low_stock_alerts: true, customer_emails: true },
  seo: { title: 'Bookends Fanny Pack', description: '', og_image: '' },
};

const cache = new Map();
const TTL = 10_000;

export async function getSetting(key) {
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - TTL) return hit.value;
  const { rows } = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  const stored = rows[0]?.value;
  const def = DEFAULTS[key];
  const value = def && stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...def, ...stored } : stored ?? def ?? null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key, value, db = { query }) {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
  cache.delete(key);
  return getSetting(key);
}

export function clearSettingsCache() {
  cache.clear();
}

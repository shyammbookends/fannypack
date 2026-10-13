import { getIntegration, saveIntegration } from './store.js';

// Shiprocket external API (https://apidocs.shiprocket.in). Uses an "API user"
// (Settings -> API -> Configure in the Shiprocket panel), not necessarily the normal login.
const API = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_DAYS = 9; // tokens are valid for 10 days; refresh a day early

async function raw(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    throw Object.assign(new Error(`Could not reach Shiprocket (${err.name === 'TimeoutError' ? 'timeout' : err.message})`), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message ||
      (data?.errors ? Object.values(data.errors).flat().join(' ') : '') ||
      `Shiprocket error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status === 401 ? 401 : 502, httpStatus: res.status, provider: 'shiprocket' });
  }
  return data;
}

// Log in with API user credentials -> token (real API call; used by "Test connection")
export async function shiprocketLogin(email, password) {
  const data = await raw('POST', '/auth/login', { body: { email, password } });
  if (!data?.token) throw Object.assign(new Error('Shiprocket did not return a token.'), { status: 502 });
  return { token: data.token, expiresAt: new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString(), companyId: data.company_id };
}

export async function shiprocketConnected() {
  const i = await getIntegration('shiprocket');
  return i.status === 'connected' && Boolean(i.config.email && i.secrets.password);
}

// Valid token, refreshed automatically and stored encrypted
export async function shiprocketToken({ force = false } = {}) {
  const i = await getIntegration('shiprocket');
  if (!i.config.email || !i.secrets.password) throw Object.assign(new Error('Shiprocket is not connected.'), { status: 400 });
  if (!force && i.secrets.token && i.secrets.token_expires && new Date(i.secrets.token_expires) > new Date()) {
    return i.secrets.token;
  }
  try {
    const t = await shiprocketLogin(i.config.email, i.secrets.password);
    await saveIntegration('shiprocket', {
      secrets: { ...i.secrets, token: t.token, token_expires: t.expiresAt },
      status: 'connected',
      last_error: null,
      checked: true,
    });
    return t.token;
  } catch (err) {
    await saveIntegration('shiprocket', { status: 'error', last_error: err.message, checked: true });
    throw err;
  }
}

// Authenticated call; on 401 refresh the token once and retry
export async function shiprocket(method, path, body) {
  let token = await shiprocketToken();
  try {
    return await raw(method, path, { token, body });
  } catch (err) {
    if (err.status !== 401) throw err;
    token = await shiprocketToken({ force: true });
    return raw(method, path, { token, body });
  }
}

export async function shiprocketConfig() {
  return (await getIntegration('shiprocket')).config;
}

// ---------- order pipeline ----------

const pad = (n) => String(n).padStart(2, '0');
const srDate = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

// items: [{ name, sku, qty, unit_price, weight_g, length_cm, width_cm, height_cm }]
export async function createShiprocketOrder(order, items, cfg) {
  const weightKg = Math.max(
    0.05,
    items.reduce((s, i) => s + (i.weight_g || cfg.default_weight_g || 500) * i.qty, 0) / 1000
  );
  const dims = (k, d) => Math.max(...items.map((i) => Number(i[k]) || 0), Number(cfg[`default_${k}`]) || d);
  const [first, ...rest] = String(order.name).trim().split(/\s+/);
  const body = {
    order_id: order.number,
    order_date: srDate(order.created_at),
    pickup_location: cfg.pickup_location,
    billing_customer_name: first,
    billing_last_name: rest.join(' ') || '.',
    billing_address: order.address_line,
    billing_city: order.city,
    billing_pincode: order.pin,
    billing_state: order.state,
    billing_country: 'India',
    billing_email: order.email,
    billing_phone: order.phone,
    shipping_is_billing: true,
    order_items: items.map((i) => ({
      name: i.name,
      sku: i.sku || `${i.product_id}${i.option ? '-' + i.option : ''}`,
      units: i.qty,
      selling_price: i.unit_price,
      discount: 0,
      tax: 0,
    })),
    payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
    sub_total: order.total,
    total_discount: order.discount_amount || 0,
    shipping_charges: order.delivery || 0,
    length: dims('length_cm', 20),
    breadth: dims('width_cm', 15),
    height: dims('height_cm', 10),
    weight: Number(weightKg.toFixed(3)),
  };
  return shiprocket('POST', '/orders/create/adhoc', body);
}

export async function assignAwb(shipmentId) {
  const data = await shiprocket('POST', '/courier/assign/awb', { shipment_id: shipmentId });
  const d = data?.response?.data || {};
  if (!d.awb_code) {
    throw Object.assign(new Error(data?.message || d?.awb_assign_error || 'AWB could not be assigned (check courier serviceability / wallet balance).'), { status: 502 });
  }
  return d; // { awb_code, courier_name, courier_company_id, ... }
}

export async function requestPickup(shipmentId) {
  const data = await shiprocket('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] });
  return data?.response || data;
}

export async function trackAwb(awb) {
  const data = await shiprocket('GET', `/courier/track/awb/${encodeURIComponent(awb)}`);
  return data?.tracking_data || data?.[awb]?.tracking_data || data;
}

export async function trackShipment(shipmentId) {
  const data = await shiprocket('GET', `/courier/track/shipment/${encodeURIComponent(shipmentId)}`);
  return data?.tracking_data || data?.[shipmentId]?.tracking_data || data;
}

// Shiprocket status text -> our shipment_status
export function mapShiprocketStatus(text) {
  const s = String(text || '').toUpperCase().replace(/_/g, ' ').trim();
  if (!s) return null;
  if (s.includes('RTO') && s.includes('DELIVER')) return 'rto_delivered';
  if (s.includes('RTO')) return 'rto';
  if (s.includes('OUT FOR DELIVERY')) return 'out_for_delivery';
  if (s === 'DELIVERED' || s.startsWith('DELIVERED')) return 'delivered';
  if (s.includes('CANCEL')) return 'cancelled';
  if (s.includes('LOST') || s.includes('DAMAGED') || s.includes('DESTROYED')) return 'lost';
  if (s.includes('UNDELIVERED') || s.includes('DELAY') || s.includes('MISROUTED') || s.includes('EXCEPTION')) return 'delayed';
  if (s.includes('OUT FOR PICKUP') || s.includes('PICKUP SCHEDULED') || s.includes('PICKUP GENERATED') || s.includes('PICKUP QUEUED') || s.includes('MANIFEST')) return 'pickup_scheduled';
  if (s.includes('PICKED UP') || s === 'SHIPPED') return 'shipped';
  if (s.includes('TRANSIT') || s.includes('REACHED') || s.includes('HUB') || s.includes('DESTINATION')) return 'in_transit';
  if (s.includes('AWB ASSIGNED') || s.includes('NEW') || s.includes('READY')) return 'processing';
  return 'in_transit';
}

export const trackingUrl = (awb) => (awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : null);

export async function cancelShiprocketOrder(shiprocketOrderId) {
  return shiprocket('POST', '/orders/cancel', { ids: [Number(shiprocketOrderId) || shiprocketOrderId] });
}

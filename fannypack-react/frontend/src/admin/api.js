// Admin API client. The session is an HttpOnly cookie (never readable here);
// every write carries X-FP-Admin: 1, which the server requires (CSRF protection).

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function adminFetch(path, { method = 'GET', body, raw, headers } = {}) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-FP-Admin': '1',
        ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is it running? (npm run dev)', 0);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized(data);
    const msg = data?.error || (res.status >= 500 && !data ? 'The server is not responding. Is it running? (npm run dev)' : `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

export const get = (p) => adminFetch(p);
export const post = (p, body = {}) => adminFetch(p, { method: 'POST', body });
export const put = (p, body = {}) => adminFetch(p, { method: 'PUT', body });
export const del = (p) => adminFetch(p, { method: 'DELETE' });

export function upload(file) {
  return adminFetch('/uploads', {
    method: 'POST',
    raw: file,
    headers: { 'X-Filename': file.name, 'Content-Type': file.type || 'application/octet-stream' },
  });
}

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Download a CSV through the authenticated API
export async function downloadCsv(path, filename) {
  const res = await fetch(`/api/admin${path}`, { credentials: 'same-origin', headers: { 'X-FP-Admin': '1' } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new ApiError(d.error || 'Export failed', res.status);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
export const fmtDate = (d, withTime = true) =>
  d
    ? new Date(d).toLocaleString('en-IN', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
export const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

import { getSetting } from './settings.js';
import { normalizeState } from './states.js';

// Gujarat PIN codes are 36xxxx - 39xxxx
const isGujaratPin = (pin) => /^3[6-9]\d{4}$/.test(pin);

// pattern "380015" (exact) or "3800*" (prefix)
const pinMatches = (pin, pattern) => {
  const p = String(pattern).trim();
  return p.endsWith('*') ? pin.startsWith(p.slice(0, -1)) : pin === p;
};

// Can we deliver to this address? { ok, message }
export async function checkServiceable({ state, pin }) {
  const cfg = await getSetting('delivery');
  const st = (normalizeState(state) || String(state || '').trim()).toLowerCase();
  const p = String(pin || '').trim();
  const no = { ok: false, message: cfg.message || 'Sorry, we do not deliver to this address yet.' };
  if (!/^[1-9]\d{5}$/.test(p)) return { ok: false, message: 'Enter a valid 6-digit PIN code.' };

  if ((cfg.blocked_pincodes || []).some((x) => pinMatches(p, x))) return no;
  if ((cfg.allowed_pincodes || []).length) {
    return (cfg.allowed_pincodes || []).some((x) => pinMatches(p, x)) ? { ok: true } : no;
  }
  if (cfg.gujarat_only) {
    return st === 'gujarat' && isGujaratPin(p) ? { ok: true } : no;
  }
  const states = (cfg.allowed_states || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (states.length && !states.includes(st)) return no;
  return { ok: true };
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { get, upload } from './api.js';

// ---------------- data loading ----------------
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(fn)
      .then(
        (data) => id === seq.current && setState({ data, error: null, loading: false }),
        (error) => id === seq.current && setState((s) => ({ ...s, error, loading: false }))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

// ---------------- basics ----------------
export function Btn({ variant = 'secondary', size, icon, loading, children, className = '', ...rest }) {
  return (
    <button type="button" className={`adm-btn ${variant} ${size || ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="adm-spin sm" /> : icon ? <i className={`fas ${icon}`} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="adm-loading"><span className="adm-spin" />{label}</div>
);

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="adm-alert critical">
      <i className="fas fa-circle-exclamation" />
      <div>{error.message || String(error)}</div>
      {onRetry && <Btn size="sm" onClick={onRetry}>Retry</Btn>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <div className={`adm-card ${className}`}>
      {(title || actions) && (
        <div className="adm-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="adm-card-actions">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'adm-card-body' : ''}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="adm-page-head">
      <div>
        {back && <a className="adm-back" href={back.href} onClick={back.onClick}><i className="fas fa-arrow-left" /> {back.label}</a>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="adm-page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'fa-inbox', title, children, action }) {
  return (
    <div className="adm-empty">
      <i className={`fas ${icon}`} />
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ---------------- status pills (color + icon + label, never color alone) ----------------
const TONES = {
  good: 'fa-circle-check',
  warning: 'fa-clock',
  serious: 'fa-triangle-exclamation',
  critical: 'fa-circle-xmark',
  info: 'fa-circle-info',
  neutral: 'fa-circle',
};
const STATUS_TONE = {
  // order
  placed: 'info', confirmed: 'info', processing: 'warning', shipped: 'info', delivered: 'good', cancelled: 'critical', pending_payment: 'warning',
  // payment
  paid: 'good', cod: 'neutral', pending: 'warning', failed: 'critical', refunded: 'serious', captured: 'good', processed: 'good',
  // shipment
  not_shipped: 'neutral', pickup_scheduled: 'warning', in_transit: 'info', out_for_delivery: 'info', rto: 'serious', rto_delivered: 'serious', delayed: 'serious', lost: 'critical',
  // product / general
  active: 'good', draft: 'neutral', archived: 'neutral', blocked: 'critical', connected: 'good', disconnected: 'neutral', error: 'critical',
  received: 'warning', ignored: 'neutral', rejected: 'critical', created: 'info', awb_assigned: 'info', fulfilled: 'good', unfulfilled: 'neutral', manual: 'info', creating: 'warning',
};
const LABELS = { cod: 'COD', pending_payment: 'Awaiting payment', not_shipped: 'Not shipped', awb_assigned: 'AWB assigned', rto: 'RTO', rto_delivered: 'RTO delivered' };

export function Status({ value, label }) {
  if (!value) return <span className="adm-muted">—</span>;
  const tone = STATUS_TONE[value] || 'neutral';
  return (
    <span className={`adm-pill ${tone}`}>
      <i className={`fas ${TONES[tone]}`} />
      {label || LABELS[value] || String(value).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

// ---------------- table ----------------
export function Table({ columns, rows, rowKey = 'id', onRowClick, selectable, selected = [], onSelect, empty, loading }) {
  const allSel = selectable && rows.length > 0 && rows.every((r) => selected.includes(r[rowKey]));
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            {selectable && (
              <th className="sel">
                <input type="checkbox" checked={allSel} onChange={(e) => onSelect(e.target.checked ? [...new Set([...selected, ...rows.map((r) => r[rowKey])])] : selected.filter((s) => !rows.some((r) => r[rowKey] === s)))} aria-label="Select all" />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows.length && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><Spinner /></td></tr>
          )}
          {!loading && !rows.length && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{empty || <EmptyState title="Nothing here yet" />}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r[rowKey]} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {selectable && (
                <td className="sel" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(r[rowKey])} onChange={(e) => onSelect(e.target.checked ? [...selected, r[rowKey]] : selected.filter((s) => s !== r[rowKey]))} aria-label="Select row" />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="adm-pager"><span>{total} result{total === 1 ? '' : 's'}</span></div>;
  return (
    <div className="adm-pager">
      <span>{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span>
      <div>
        <Btn size="sm" icon="fa-chevron-left" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span className="adm-pager-n">Page {page} / {pages}</span>
        <Btn size="sm" icon="fa-chevron-right" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="adm-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="adm-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------- overlays ----------------
function useEsc(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const f = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [open, onClose]);
}

export function Modal({ open, title, onClose, children, footer, width = 520 }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="adm-root adm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="adm-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-modal-head">
          <h3>{title}</h3>
          <button className="adm-x" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </div>
        <div className="adm-modal-body">{children}</div>
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, title, onClose, children, footer, width = 560 }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="adm-root adm-overlay drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="adm-drawer" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-modal-head">
          <h3>{title}</h3>
          <button className="adm-x" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
        </div>
        <div className="adm-drawer-body">{children}</div>
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

// ---------------- toasts & confirm ----------------
const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirm] = useState(null);
  const toast = useCallback((message, tone = 'good') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'critical' ? 7000 : 3800);
  }, []);
  const confirm = useCallback(
    (opts) => new Promise((resolve) => setConfirm({ ...opts, resolve })),
    []
  );
  const close = (v) => {
    confirmState?.resolve(v);
    setConfirm(null);
  };
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="adm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`adm-toast ${t.tone}`}>
            <i className={`fas ${TONES[t.tone] || TONES.info}`} />
            {t.message}
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(confirmState)}
        title={confirmState?.title || 'Are you sure?'}
        onClose={() => close(false)}
        width={440}
        footer={
          <>
            <Btn onClick={() => close(false)}>Cancel</Btn>
            <Btn variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{confirmState?.confirmLabel || 'Confirm'}</Btn>
          </>
        }
      >
        <p className="adm-confirm-text">{confirmState?.message}</p>
      </Modal>
    </UiCtx.Provider>
  );
}

// ---------------- form fields ----------------
export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`adm-field ${error ? 'invalid' : ''} ${className}`}>
      {label && <span className="adm-label">{label}</span>}
      {children}
      {error ? <span className="adm-field-err"><i className="fas fa-circle-exclamation" />{error}</span> : hint ? <span className="adm-hint">{hint}</span> : null}
    </label>
  );
}

export const Input = (p) => <input className="adm-input" {...p} value={p.value ?? ''} />;
export const Textarea = (p) => <textarea className="adm-input" rows={4} {...p} value={p.value ?? ''} />;
export function Select({ options, ...p }) {
  return (
    <select className="adm-input" {...p} value={p.value ?? ''}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`adm-toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="adm-toggle-ui" />
      {label && <span>{label}</span>}
    </label>
  );
}

// Tag-style list editor (one value per line or chips)
export function ListInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  return (
    <div className="adm-chips">
      {value.map((v) => (
        <span key={v} className="adm-chip">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><i className="fas fa-xmark" /></button>
        </span>
      ))}
      <input
        className="adm-chip-input"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

// ---------------- date range filter ----------------
export const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

export function DateRange({ value, onChange }) {
  const [from, setFrom] = useState(value.from || '');
  const [to, setTo] = useState(value.to || '');
  return (
    <div className="adm-range">
      <div className="adm-seg">
        {RANGES.map((r) => (
          <button key={r.key} className={value.range === r.key ? 'on' : ''} onClick={() => (r.key === 'custom' ? onChange({ range: 'custom', from, to }) : onChange({ range: r.key }))}>
            {r.label}
          </button>
        ))}
      </div>
      {value.range === 'custom' && (
        <div className="adm-range-custom">
          <input type="date" className="adm-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span>to</span>
          <input type="date" className="adm-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <Btn size="sm" variant="primary" disabled={!from || !to} onClick={() => onChange({ range: 'custom', from, to })}>Apply</Btn>
        </div>
      )}
    </div>
  );
}

// ---------------- media picker (upload + library) ----------------
export function MediaPicker({ open, onClose, onPick, accept = 'image/*', type = 'images' }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const lib = useAsync(() => (open ? get('/uploads') : Promise.resolve([])), [open]);
  const [url, setUrl] = useState('');
  const doUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload(file);
      toast('Uploaded');
      onPick(r.url);
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy(false);
    }
  };
  const items = (lib.data || []).filter((f) => f.type === type);
  return (
    <Modal open={open} onClose={onClose} title="Choose media" width={760}>
      <div className="adm-media-top">
        <label className="adm-btn primary">
          {busy ? <span className="adm-spin sm" /> : <i className="fas fa-upload" />}
          <span>Upload file</span>
          <input type="file" accept={accept} hidden onChange={(e) => doUpload(e.target.files?.[0])} />
        </label>
        <div className="adm-media-url">
          <input className="adm-input" placeholder="…or paste an image path, e.g. /img/logo.png" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Btn disabled={!url.trim()} onClick={() => onPick(url.trim())}>Use</Btn>
        </div>
      </div>
      {lib.loading ? (
        <Spinner />
      ) : items.length ? (
        <div className="adm-media-grid">
          {items.map((f) => (
            <button key={f.url} className="adm-media-item" onClick={() => onPick(f.url)} title={f.url}>
              {type === 'images' ? <img src={f.url} alt="" loading="lazy" /> : <span><i className={`fas ${type === 'videos' ? 'fa-film' : 'fa-cube'}`} />{f.url.split('/').pop()}</span>}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon="fa-images" title="No uploads yet">Upload a file to use it anywhere on the site.</EmptyState>
      )}
    </Modal>
  );
}

// Image field with preview + picker
export function ImageField({ label, value, onChange, hint, type = 'images', accept = 'image/*' }) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="adm-imgfield">
        <div className="adm-imgfield-prev">
          {value ? (type === 'images' ? <img src={value} alt="" /> : <i className={`fas ${type === 'videos' ? 'fa-film' : 'fa-cube'}`} />) : <i className="fas fa-image" />}
        </div>
        <div className="adm-imgfield-actions">
          <input className="adm-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="No file" />
          <div>
            <Btn size="sm" icon="fa-folder-open" onClick={() => setOpen(true)}>Choose</Btn>
            {value && <Btn size="sm" variant="ghost" icon="fa-xmark" onClick={() => onChange('')}>Remove</Btn>}
          </div>
        </div>
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} type={type} accept={accept} onPick={(u) => { onChange(u); setOpen(false); }} />
    </Field>
  );
}

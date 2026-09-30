import { useEffect, useRef, useState } from 'react';

// Small SVG charts for the admin (no chart library).
// Single series -> one hue (--series-1), thin marks, recessive grid, hover crosshair + tooltip,
// and a visually-hidden table so the numbers are available without the picture.

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export const compactInr = (n) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : `₹${Math.round(n)}`;

export function tickLabel(t, bucket) {
  const d = new Date(t);
  if (bucket === 'hour') return d.toLocaleTimeString('en-IN', { hour: 'numeric' });
  if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function SrTable({ caption, rows, format }) {
  return (
    <table className="adm-sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><th>{r.label}</th><td>{format(r.value)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// kind: "line" (area + line) or "bar"
export function TimeChart({ data, valueKey, bucket, format = (v) => v, axisFormat = format, kind = 'line', height = 230, caption }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const m = { l: 56, r: 12, t: 12, b: 28 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = niceMax(Math.max(...vals, 0));
  const n = data.length;
  const x = (i) => (kind === 'bar' ? (w / n) * i + w / n / 2 : n <= 1 ? w / 2 : (w / (n - 1)) * i);
  const y = (v) => h - (v / max) * h;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 90))));
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${h}L${x(0).toFixed(1)},${h}Z`;
  const barW = Math.max(2, Math.min(28, w / n - 2));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - m.l;
    const i = kind === 'bar' ? Math.floor((px / w) * n) : Math.round((px / w) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="adm-chart" ref={ref}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={caption}>
        <g transform={`translate(${m.l},${m.t})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={w} y1={y(t)} y2={y(t)} className="grid" />
              <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{axisFormat(t)}</text>
            </g>
          ))}
          {data.map((d, i) =>
            i % xEvery === 0 ? (
              <text key={d.t} x={x(i)} y={h + 18} textAnchor="middle" className="axis">{tickLabel(d.t, bucket)}</text>
            ) : null
          )}
          {kind === 'line' ? (
            <>
              <path d={area} className="area" />
              <path d={line} className="line" />
            </>
          ) : (
            vals.map((v, i) => {
              const bh = Math.max(v > 0 ? 2 : 0, h - y(v));
              const bx = x(i) - barW / 2;
              const r = Math.min(4, barW / 2, bh);
              return (
                <path
                  key={i}
                  className={`bar ${hover === i ? 'on' : ''}`}
                  d={bh ? `M${bx},${h}V${h - bh + r}Q${bx},${h - bh} ${bx + r},${h - bh}H${bx + barW - r}Q${bx + barW},${h - bh} ${bx + barW},${h - bh + r}V${h}Z` : ''}
                />
              );
            })
          )}
          {hover != null && (
            <>
              {kind === 'line' && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} className="cross" />}
              {kind === 'line' && <circle cx={x(hover)} cy={y(vals[hover])} r={4.5} className="dot" />}
            </>
          )}
        </g>
      </svg>
      {hover != null && (
        <div className="adm-tip" style={{ left: Math.min(width - 150, Math.max(0, m.l + x(hover) - 70)), top: 4 }}>
          <span>{tickLabel(data[hover].t, bucket)}{bucket === 'hour' ? '' : ''}</span>
          <strong>{format(vals[hover])}</strong>
        </div>
      )}
      <SrTable caption={caption} rows={data.map((d) => ({ label: tickLabel(d.t, bucket), value: Number(d[valueKey]) || 0 }))} format={format} />
    </div>
  );
}

// Ranked horizontal bars (magnitude, one hue). Values in ink, not the series colour.
export function BarList({ rows, format = (v) => v, empty = 'No sales in this period yet.' }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return <p className="adm-muted adm-chart-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="adm-barlist">
      {rows.map((r, i) => (
        <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}>
          <div className="adm-barlist-top">
            <span>{r.label}</span>
            <strong>{format(r.value)}</strong>
          </div>
          <div className="adm-barlist-track">
            <div className={`adm-barlist-fill ${hover === i ? 'on' : ''}`} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <small>{r.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

// Status breakdown: segmented bar + legend with icon + label + count (never colour alone)
const STATUS_COLOR = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', info: '#2a78d6', neutral: '#a09e98' };
const STATUS_ICON = { good: 'fa-circle-check', warning: 'fa-clock', serious: 'fa-triangle-exclamation', critical: 'fa-circle-xmark', info: 'fa-circle-info', neutral: 'fa-circle' };

export function StatusBreakdown({ rows, toneOf, labelOf }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return <p className="adm-muted adm-chart-empty">No orders in this period yet.</p>;
  return (
    <div className="adm-status-break">
      <div className="adm-status-bar" role="img" aria-label={rows.map((r) => `${labelOf(r.key)} ${r.n}`).join(', ')}>
        {rows.map((r) => (
          <span key={r.key} style={{ width: `${(r.n / total) * 100}%`, background: STATUS_COLOR[toneOf(r.key)] }} title={`${labelOf(r.key)}: ${r.n}`} />
        ))}
      </div>
      <ul>
        {rows.map((r) => {
          const tone = toneOf(r.key);
          return (
            <li key={r.key}>
              <i className={`fas ${STATUS_ICON[tone]}`} style={{ color: STATUS_COLOR[tone] }} />
              <span>{labelOf(r.key)}</span>
              <strong>{r.n}</strong>
              <em>{Math.round((r.n / total) * 100)}%</em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

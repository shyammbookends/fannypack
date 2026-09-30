import { Fragment } from 'react';
import { useSite } from '../shop/SiteContext.jsx';
import Counter from './Counter.jsx';

// Collection "pills" sit on the left edge of the 480px circle, spread along the arc
const R = 240;
const SPREAD = 330; // vertical distance between the first and last pill
const FALLBACK_ACCENTS = ['#e8281a', '#f6a623', '#ffd60a', '#ffffff'];

export function openCollection(onFilter, id) {
  onFilter(id);
  const menu = document.getElementById('menu');
  if (menu) window.scrollTo({ top: menu.offsetTop - 80, behavior: 'smooth' });
}

export default function Hero({ onFilter }) {
  const { content, categories } = useSite();
  const h = content.hero;
  const pills = h.show_collection_pills === false ? [] : categories.slice(0, 5);
  const offsets = pills.map((_, i) => (pills.length === 1 ? 0 : -SPREAD / 2 + (SPREAD * i) / (pills.length - 1)));

  return (
    <section id="hero">
      <div className="hs hs1"></div>
      <div className="hs hs2"></div>
      {h.video && <video className="hvideo" src={h.video} autoPlay muted loop playsInline aria-hidden="true"></video>}
      {h.bg_text && <div className="hbgtxt" aria-hidden="true">{h.bg_text}</div>}
      <div className="container">
        <div className="row align-items-center g-5 hrow">
          <div className="col-lg-6">
            <h1 className="htitle">
              {String(h.title || '').split('\n').map((line, i) => {
                const at = h.highlight ? line.indexOf(h.highlight) : -1;
                return (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {at < 0 ? line : <>{line.slice(0, at)}<span className="hl">{h.highlight}</span>{line.slice(at + h.highlight.length)}</>}
                  </Fragment>
                );
              })}
            </h1>
            {h.description && <p className="hdesc">{h.description}</p>}
            <div className="d-flex flex-wrap gap-3 mb-2">
              {h.cta_primary?.label && <a href={h.cta_primary.href || '#menu'} className="btn-red">{h.cta_primary.label} <i className="fas fa-arrow-right"></i></a>}
              {h.cta_secondary?.label && <a href={h.cta_secondary.href || '#category'} className="btn-line">{h.cta_secondary.label} <i className="fas fa-arrow-right"></i></a>}
            </div>
            {h.stats?.length > 0 && (
              <div className="hstats d-flex gap-3 flex-wrap mt-4">
                {h.stats.map((s, i) => (
                  <Fragment key={`${s.label}-${i}`}>
                    {i > 0 && <div className="sdiv"></div>}
                    <div className="hstat"><Counter num={Number(s.num) || 0} suf={s.suffix || ''} /><small>{s.label}</small></div>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
          <div className="col-lg-6">
            <div className="horbit">
              <div className="hcircle">
                <img className="hlogo" src={h.image || '/img/logo.png'} alt="Bookends Fanny Pack" />
              </div>
              <div className="hcats">
                {pills.map((c, i) => {
                  const dy = offsets[i];
                  const edgeX = R - Math.sqrt(R * R - dy * dy);
                  return (
                    <button
                      key={c.id}
                      className="hcat"
                      onClick={() => openCollection(onFilter, c.id)}
                      style={{
                        '--top': `${R + dy}px`,
                        '--right': `${2 * R - edgeX}px`,
                        '--i': i,
                        '--accent': c.accent || FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length],
                      }}
                    >
                      <span className="hcat-pill">
                        <span className="hcat-ico"><i className={'fas ' + (c.icon || 'fa-tag')}></i></span>
                        <span className="hcat-txt">
                          <strong>{c.name}</strong>
                          <small>{c.product_count} item{c.product_count === 1 ? '' : 's'}</small>
                        </span>
                        <i className="fas fa-arrow-right hcat-go"></i>
                      </span>
                      <span className="hcat-line"></span>
                      <span className="hcat-dot"></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


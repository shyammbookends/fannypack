import { useEffect, useRef } from 'react';
import { Highlighted, useSite } from '../shop/SiteContext.jsx';
import { tiltHandlers } from '../tilt.js';

export default function Category({ filter, onFilter }) {
  const { content, categories } = useSite();
  const s = content.collections_section || {};
  const rowRef = useRef(null);

  // Scroll to the menu, then show that category's products
  const pick = (id) => {
    const menu = document.getElementById('menu');
    if (menu) window.scrollTo({ top: menu.offsetTop - 80, behavior: 'smooth' });
    setTimeout(() => onFilter(id), 480);
  };

  // Mark cards once they scroll into view (mobile.css plays a 3D flip-in on "cat-in")
  useEffect(() => {
    const cards = rowRef.current.querySelectorAll('.catcard');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('cat-in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [categories]);

  return (
    <section id="category">
      <div className="container">
        <div className="text-center mb-5" data-aos="fade-up">
          {s.label && <span className="slbl">{s.label}</span>}
          <h2 className="stitle"><Highlighted text={s.title} highlight={s.highlight} /></h2>
          <div className="sline"></div>
          {s.description && <p className="sdesc mx-auto" style={{ maxWidth: 520 }}>{s.description}</p>}
        </div>
        <div className="row g-3 justify-content-center" ref={rowRef}>
          {categories.map((c, i) => (
            <div className="col-6 col-md-3 catcol" data-aos="zoom-in" data-aos-delay={i * 70} key={c.id}>
              <div
                className={'catcard' + (filter === c.id ? ' active' : '')}
                data-cat={c.id}
                style={{ '--i': i }}
                role="button"
                tabIndex={0}
                onClick={() => pick(c.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(c.id))}
                {...tiltHandlers}
              >
                {c.image ? <img className="catimg catimg-product" src={c.image} alt={c.name} /> : (
                  <div className="catimg catimg-blank catimg-icon" style={{ '--accent': c.accent || undefined }}><i className={'fas ' + (c.icon || 'fa-tag')}></i></div>
                )}
                <div className="catnm">{c.name}</div>
                <div className="catct">{c.product_count} item{c.product_count === 1 ? '' : 's'}</div>
                {/* arrow is only shown in the mobile list layout */}
                <span className="catgo"><i className="fas fa-arrow-right"></i></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

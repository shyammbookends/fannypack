import { Fragment, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import AOS from 'aos';

import Hero from '../components/Hero.jsx';
import Marquee from '../components/Marquee.jsx';
import Category from '../components/Category.jsx';
import About from '../components/About.jsx';
import Menu from '../components/Menu.jsx';
import Special from '../components/Special.jsx';
import Ribbons3D from '../components/Ribbons3D.jsx';
import Ring3D from '../components/Ring3D.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import { scrollToSection } from '../utils.js';

export default function Home({ filter, setFilter }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const { ready, error, retry, content, seo } = useSite();
  useSeo(seo.title && seo.title !== 'Bookends Fanny Pack' ? seo.title : '', { description: seo.description || undefined });

  useEffect(() => {
    if (ready) AOS.refreshHard();
  }, [ready]);

  // "/?category=ghaslate#menu" opens that collection
  useEffect(() => {
    const cat = params.get('category');
    if (cat) setFilter(cat);
  }, [params, setFilter]);

  // Coming from another page with "/#section": scroll there once the page is drawn
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id || !ready) return;
    const t = setTimeout(() => scrollToSection(id), 120);
    return () => clearTimeout(t);
  }, [location.hash, location.key, ready]);

  if (!ready) {
    return (
      <main className="shop-page container">
        {error ? (
          <div className="shop-alert text-center">
            <p>{error}</p>
            <button className="btn-red" onClick={retry}><i className="fas fa-rotate-right"></i>Try again</button>
          </div>
        ) : (
          <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>
        )}
      </main>
    );
  }

  const promos = (content.promos || []).filter((p) => p.enabled !== false);
  const fx = content.effects || {};
  return (
    <>
      <Hero onFilter={setFilter} />
      <Marquee />
      <Category filter={filter} onFilter={setFilter} />
      <About />
      <Menu filter={filter} onFilter={setFilter} />
      {promos.map((p, i) => (
        <Fragment key={p.id || i}>
          <Special promo={{ ...p, id: p.id || `promo-${i}` }} onFilter={setFilter} />
          {/* 3D effects sit between the banners, as in the original design */}
          {i === 0 && fx.ribbons !== false && <Ribbons3D />}
          {i === promos.length - 2 && promos.length > 2 && fx.ring !== false && <Ring3D speed={fx.ring_speed} />}
        </Fragment>
      ))}
    </>
  );
}

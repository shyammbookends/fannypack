import { Highlighted } from '../shop/SiteContext.jsx';
import { openCollection } from './Hero.jsx';

// Promo band for one collection (Admin -> Content -> Promo banners):
// tag, heading, item line, button and banner image. `reverse` puts the image on the left.
export default function Special({ promo, onFilter }) {
  const { id, variant, reverse, tag, title, highlight, items = [], button, collection, image } = promo;
  return (
    <section id={id} className={'special' + (variant ? ' special--' + variant : '')}>
      <div className="spbg"></div>
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div className={'row align-items-center g-5' + (reverse ? ' flex-lg-row-reverse' : '')}>
          <div className="col-lg-6" data-aos={reverse ? 'fade-left' : 'fade-right'}>
            {tag && <div className="sptag">{tag}</div>}
            <h2 className="sptitle"><Highlighted text={title} highlight={highlight} /></h2>
            {items.length > 0 && (
              <p className="spdesc spflavours">
                {items.map((f, i) => (
                  <span key={`${f}-${i}`}>{i > 0 && <em> • </em>}{f}</span>
                ))}
              </p>
            )}
            {button && (
              <button className="btn-red" onClick={() => (collection ? openCollection(onFilter, collection) : openCollection(onFilter, 'all'))}>
                {button} <i className="fas fa-arrow-right"></i>
              </button>
            )}
          </div>
          <div className="col-lg-6" data-aos={reverse ? 'fade-right' : 'fade-left'}>
            <div className="spimgw">
              <div className="spglow"></div>
              {image ? (
                <img className="spbanner" src={image} alt={String(title || '').replace(/\n/g, ' ')} loading="lazy" />
              ) : (
                <div className="spblank"><i className="fas fa-image"></i></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

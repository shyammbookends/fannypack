import { Highlighted, useSite } from '../shop/SiteContext.jsx';

export default function About() {
  const { content } = useSite();
  const a = content.about;
  if (!a || a.enabled === false) return null;
  return (
    <section id="about">
      <div className="container">
        <div className="row align-items-center g-5">
          <div className="col-lg-5" data-aos="fade-right">
            <div className="astack">
              {a.badge_number && (
                <div className="aexp">
                  <span className="anum">{a.badge_number}</span>
                  <small>{String(a.badge_label || '').split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</small>
                </div>
              )}
              {a.image && <div className="amain"><img src={a.image} alt="Bookends Fanny Pack" /></div>}
              {a.small_image && <div className="asm"><img src={a.small_image} alt="" /></div>}
            </div>
          </div>
          <div className="col-lg-7" data-aos="fade-left">
            {a.label && <span className="slbl">{a.label}</span>}
            <h2 className="stitle text-start"><Highlighted text={a.title} highlight={a.highlight} /></h2>
            <div className="sline lft"></div>
            {a.text && <p className="sdesc mb-4">{a.text}</p>}
            <div className="mb-4">
              {(a.features || []).map((f, i) => (
                <div className="fti" key={`${f.title}-${i}`}>
                  <div className={'ftico ' + (f.tone || 'r')}><i className={'fas ' + (f.icon || 'fa-star')}></i></div>
                  <div>
                    <h6>{f.title}</h6>
                    <p>{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
            {a.button?.label && <a href={a.button.href || '#menu'} className="btn-red"><i className="fas fa-book-open"></i>{a.button.label}</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { useSite } from '../shop/SiteContext.jsx';

const SOCIAL_ICON = { facebook: 'fa-facebook-f', instagram: 'fa-instagram', twitter: 'fa-x-twitter', youtube: 'fa-youtube', tiktok: 'fa-tiktok' };

export default function Footer() {
  const { content, categories, store } = useSite();
  const f = content?.footer || {};
  const email = f.email || store.contact_email;
  const phone = f.phone || store.phone;
  const address = f.address || store.address;
  const socials = Object.entries(f.socials || {}).filter(([, url]) => /^https?:\/\//.test(url || ''));
  const contact = [
    email && { icon: 'fa-envelope', label: 'Email', value: <a href={`mailto:${email}`}>{email}</a> },
    phone && { icon: 'fa-phone', label: 'Phone', value: <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> },
    address && { icon: 'fa-location-dot', label: 'Address', value: <span className="pre">{address}</span> },
    (f.hours || store.support_hours) && { icon: 'fa-clock', label: 'Hours', value: f.hours || store.support_hours },
  ].filter(Boolean);

  return (
    <footer id="contact">
      <div className="container">
        <div className="row g-5">
          <div className="col-lg-4">
            <img className="flogo-img" src={store.logo || '/img/logo.png'} alt={store.name || 'Bookends Fanny Pack'} />
            {f.description && <p className="fdesc">{f.description}</p>}
            {socials.length > 0 && (
              <div className="fsocial">
                {socials.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noreferrer" aria-label={k}><i className={'fab ' + (SOCIAL_ICON[k] || `fa-${k}`)}></i></a>
                ))}
              </div>
            )}
          </div>
          <div className="col-sm-6 col-lg-2">
            <div className="ftit">Shop</div>
            <ul className="flinks ps-0">
              <li><Link to="/shop"><i className="fas fa-chevron-right"></i>All products</Link></li>
              {categories.map((c) => (
                <li key={c.id}><Link to={`/shop?category=${encodeURIComponent(c.id)}`}><i className="fas fa-chevron-right"></i>{c.name}</Link></li>
              ))}
            </ul>
          </div>
          <div className="col-sm-6 col-lg-2">
            <div className="ftit">Help</div>
            <ul className="flinks ps-0">
              <li><Link to="/account/orders"><i className="fas fa-chevron-right"></i>Track your order</Link></li>
              <li><Link to="/shipping-policy"><i className="fas fa-chevron-right"></i>Shipping</Link></li>
              <li><Link to="/refund-policy"><i className="fas fa-chevron-right"></i>Returns &amp; refunds</Link></li>
              <li><Link to="/contact"><i className="fas fa-chevron-right"></i>Contact us</Link></li>
            </ul>
          </div>
          <div className="col-lg-4">
            <div className="ftit">Get In Touch</div>
            {contact.map((c) => (
              <div className="fci" key={c.label}>
                <div className="fciico"><i className={'fas ' + c.icon}></i></div>
                <div className="fciinfo"><strong>{c.label}</strong>{c.value}</div>
              </div>
            ))}
            {(store.fssai || store.gstin) && (
              <div className="flegal">
                {store.fssai && <span><strong>FSSAI Lic. No.</strong> {store.fssai}</span>}
                {store.gstin && <span><strong>GSTIN</strong> {store.gstin}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="fbot">
        <div className="container">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <p>
              &copy; {new Date().getFullYear()} <span>{f.copyright || store.legal_name || store.name || 'Bookends Fanny Pack'}</span>. All Rights Reserved.
            </p>
            <div className="fbot-links">
              <Link to="/privacy-policy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/refund-policy">Refunds</Link>
              <Link to="/shipping-policy">Shipping</Link>
              <Link to="/contact">Contact</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

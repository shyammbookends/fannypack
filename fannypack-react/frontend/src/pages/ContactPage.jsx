import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../shop/api.js';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';
import '../assets/css/contact.css';

const TOPICS = [
  ['order', 'An order', 'fa-box'],
  ['product', 'A product', 'fa-pepper-hot'],
  ['wholesale', 'Wholesale / bulk', 'fa-boxes-stacked'],
  ['collab', 'Collaboration', 'fa-handshake'],
  ['other', 'Something else', 'fa-comment-dots'],
];

const FAQ = [
  ['Where do you deliver?', <>We deliver across Gujarat. Check your PIN code at checkout before you pay - see the <Link to="/shipping-policy">Shipping Policy</Link>.</>],
  ['How long does delivery take?', 'Orders are usually packed within 1-2 working days and delivered 2-5 working days after dispatch.'],
  ['Can I pay cash on delivery?', 'Yes, Cash on Delivery is available. You can also pay online with UPI, cards or net banking.'],
  ['How do I track or cancel my order?', <>Open <Link to="/account/orders">Your Orders</Link>: you can track it, download the invoice, and cancel it until it ships.</>],
  ['My order arrived damaged. What now?', <>Sorry about that! Message us within 48 hours with photos and your order number and we will replace or refund it - see the <Link to="/refund-policy">Refund Policy</Link>.</>],
];

// Shared pointer tilt: writes --rx/--ry (degrees) and --gx/--gy (glare position) on the element
function useTilt(strength = 10) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let last;
    const apply = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const x = (last.clientX - r.left) / r.width - 0.5;
      const y = (last.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(x * strength).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * strength).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    };
    const move = (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
    };
  }, [strength]);
  return ref;
}

function TiltCard({ className = '', children, strength, as: Tag = 'div', ...rest }) {
  const ref = useTilt(strength);
  return (
    <Tag ref={ref} className={'ct-tilt ' + className} {...rest}>
      <span className="ct-glare" aria-hidden="true"></span>
      {children}
    </Tag>
  );
}

// Hero: a slowly spinning 3D cube of brand icons + chillies that drift with the pointer (parallax)
function Hero3D() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--mx', px.toFixed(3));
      el.style.setProperty('--my', py.toFixed(3));
    };
    const move = (e) => {
      const r = el.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // only animate while the hero is on screen
    const io = new IntersectionObserver(([en]) => el.classList.toggle('ct-paused', !en.isIntersecting));
    io.observe(el);
    el.addEventListener('pointermove', move);
    return () => {
      io.disconnect();
      el.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  const faces = [
    ['front', 'fa-pepper-hot'],
    ['back', 'fa-lemon'],
    ['right', 'fa-fire-flame-curved'],
    ['left', 'fa-shirt'],
    ['top', 'fa-envelope'],
    ['bottom', 'fa-phone'],
  ];
  return (
    <section className="ct-hero" ref={ref}>
      <div className="ct-orb ct-orb-1" aria-hidden="true"></div>
      <div className="ct-orb ct-orb-2" aria-hidden="true"></div>
      <div className="ct-floaters" aria-hidden="true">
        {['fa-pepper-hot', 'fa-lemon', 'fa-pepper-hot', 'fa-fire-flame-curved', 'fa-pepper-hot', 'fa-star'].map((ic, i) => (
          <i key={i} className={`fas ${ic} ct-float ct-float-${i + 1}`}></i>
        ))}
      </div>
      <div className="container ct-hero-grid">
        <div className="ct-hero-text">
          <span className="ct-kicker"><i className="fas fa-comment-dots"></i> Contact us</span>
          <h1>Let's talk <span>heat.</span></h1>
          <p>Questions about an order, a flavour, bulk orders or a collab? Send us a message - a real person reads every one and replies within a working day.</p>
          <div className="ct-hero-cta">
            <a href="#contact-form" className="btn-red"><i className="fas fa-paper-plane"></i>Send a message</a>
            <Link to="/account/orders" className="btn-line ct-btn-light">Track an order <i className="fas fa-arrow-right"></i></Link>
          </div>
        </div>
        <div className="ct-stage" aria-hidden="true">
          <div className="ct-cube-wrap">
            <div className="ct-cube">
              {faces.map(([side, ic]) => (
                <div key={side} className={`ct-face ct-${side}`}><i className={`fas ${ic}`}></i></div>
              ))}
            </div>
          </div>
          <div className="ct-ring"></div>
          <div className="ct-shadow"></div>
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: 'order', orderNumber: '', message: '', website: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const cardRef = useTilt(4);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email, phone: f.phone || user.phone || '' }));
  }, [user]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFields((f) => ({ ...f, [k]: undefined }));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (form.name.trim().length < 2) local.name = 'Please enter your name.';
    if (!/^\S+@\S+\.\S{2,}$/.test(form.email.trim())) local.email = 'Please enter a valid email so we can reply.';
    if (form.message.trim().length < 10) local.message = 'Please write a little more (at least 10 characters).';
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.contact(form);
      setSent(true);
    } catch (err) {
      setFields(err.data?.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, props = {}, wide = false) => (
    <div className={'ct-field' + (wide ? ' wide' : '') + (fields[k] ? ' invalid' : '')}>
      <input id={`ct-${k}`} placeholder=" " value={form[k]} onChange={set(k)} {...props} />
      <label htmlFor={`ct-${k}`}>{label}</label>
      {fields[k] && <small className="ct-err">{fields[k]}</small>}
    </div>
  );

  return (
    <div className={'ct-flip' + (sent ? ' flipped' : '')} id="contact-form">
      <div className="ct-flip-inner">
        <form ref={cardRef} className="ct-form ct-tilt ct-front" onSubmit={submit} noValidate aria-hidden={sent}>
          <span className="ct-glare" aria-hidden="true"></span>
          <h2>Send us a message</h2>
          <p className="ct-muted">We usually reply within 1 working day.</p>
          <div className="ct-topics" role="radiogroup" aria-label="What is it about?">
            {TOPICS.map(([k, label, ic]) => (
              <button type="button" key={k} role="radio" aria-checked={form.topic === k} className={'ct-topic' + (form.topic === k ? ' on' : '')} onClick={() => setForm((f) => ({ ...f, topic: k }))}>
                <i className={`fas ${ic}`}></i>{label}
              </button>
            ))}
          </div>
          <div className="ct-grid">
            {field('name', 'Your name', { autoComplete: 'name' })}
            {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
            {field('phone', 'Mobile (optional)', { inputMode: 'tel', autoComplete: 'tel' })}
            {form.topic === 'order'
              ? field('orderNumber', 'Order number (optional)', { placeholder: ' ', autoComplete: 'off' })
              : <div className="ct-field ct-spacer" aria-hidden="true"></div>}
            <div className={'ct-field wide' + (fields.message ? ' invalid' : '')}>
              <textarea id="ct-message" rows={5} placeholder=" " value={form.message} onChange={set('message')} maxLength={3000}></textarea>
              <label htmlFor="ct-message">Your message</label>
              <small className="ct-count">{form.message.length}/3000</small>
              {fields.message && <small className="ct-err">{fields.message}</small>}
            </div>
            {/* hidden from people, bots fill it in */}
            <input className="ct-hp" tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={set('website')} aria-hidden="true" />
          </div>
          {error && !Object.values(fields).some(Boolean) && <div className="ct-alert" role="alert"><i className="fas fa-triangle-exclamation"></i>{error}</div>}
          <button className="btn-red ct-submit" disabled={busy}>
            {busy ? <><span className="shop-spinner sm"></span>Sending…</> : <><i className="fas fa-paper-plane"></i>Send message</>}
          </button>
          <p className="ct-small">By sending this you agree to our <Link to="/privacy-policy">Privacy Policy</Link>. We only use your details to reply.</p>
        </form>
        <div className="ct-form ct-back" role="status" aria-hidden={!sent}>
          <div className="ct-sent-icon"><i className="fas fa-check"></i></div>
          <h2>Message sent!</h2>
          <p>Thanks {form.name.split(' ')[0] || 'for writing'} - we'll reply to <strong>{form.email}</strong> within a working day.</p>
          <button type="button" className="btn-line" onClick={() => { setSent(false); setForm((f) => ({ ...f, message: '', orderNumber: '' })); }}>Send another message</button>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  const { store, content } = useSite();
  const footer = content?.footer || {};
  const email = store.contact_email || footer.email;
  const phone = store.phone || footer.phone;
  const address = store.address || footer.address;
  const hours = store.support_hours || footer.hours;
  const wa = (phone || '').replace(/\D/g, '');
  const socials = Object.entries(footer.socials || {}).filter(([, url]) => /^https?:\/\//.test(url || ''));
  const [open, setOpen] = useState(0);
  useSeo('Contact Us', { description: `Get in touch with ${store.name || 'Bookends Fanny Pack'} about an order, a product, bulk orders or a collaboration.` });

  const cards = [
    email && { icon: 'fa-envelope', title: 'Email us', value: email, href: `mailto:${email}`, note: 'Replies within 1 working day', tone: 'red' },
    phone && { icon: 'fa-phone', title: 'Call us', value: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}`, note: hours || 'Mon-Sat', tone: 'amber' },
    wa.length >= 10 && { icon: 'fa-whatsapp', brand: true, title: 'WhatsApp', value: 'Chat with us', href: `https://wa.me/${wa.length === 10 ? '91' + wa : wa}`, note: 'Quick questions', tone: 'green', external: true },
    { icon: 'fa-box', title: 'Your orders', value: 'Track, cancel, invoice', to: '/account/orders', note: 'Sign in to see them', tone: 'blue' },
  ].filter(Boolean);

  return (
    <main className="ct-page">
      <Hero3D />

      <section className="container ct-cards">
        {cards.map((c, i) => {
          const inner = (
            <>
              <span className={`ct-card-ico ${c.tone}`}><i className={`${c.brand ? 'fab' : 'fas'} ${c.icon}`}></i></span>
              <strong>{c.title}</strong>
              <span className="ct-card-val">{c.value}</span>
              <small>{c.note}</small>
            </>
          );
          return c.to ? (
            <TiltCard key={i} as={Link} to={c.to} className="ct-card" style={{ '--d': `${i * 90}ms` }}>{inner}</TiltCard>
          ) : (
            <TiltCard key={i} as="a" href={c.href} className="ct-card" style={{ '--d': `${i * 90}ms` }} {...(c.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</TiltCard>
          );
        })}
      </section>

      <section className="container ct-main">
        <ContactForm />
        <aside className="ct-side">
          <TiltCard className="ct-info" strength={6}>
            <h3><i className="fas fa-store"></i> Visit / write to us</h3>
            <ul>
              <li><span>Business</span>{store.legal_name || store.name}</li>
              {address && <li><span>Address</span><span className="pre">{address}</span></li>}
              {hours && <li><span>Hours</span>{hours}</li>}
              {store.gstin && <li><span>GSTIN</span>{store.gstin}</li>}
              {store.fssai && <li><span>FSSAI Lic.</span>{store.fssai}</li>}
            </ul>
            {socials.length > 0 && (
              <div className="ct-socials">
                {socials.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noreferrer" aria-label={k}><i className={`fab fa-${k === 'twitter' ? 'x-twitter' : k === 'facebook' ? 'facebook-f' : k}`}></i></a>
                ))}
              </div>
            )}
          </TiltCard>
          <TiltCard className="ct-info ct-grievance" strength={6}>
            <h3><i className="fas fa-shield-halved"></i> Grievance Officer</h3>
            <p>For complaints about an order, a product or your personal data (Consumer Protection (E-Commerce) Rules, 2020 &amp; DPDP Act, 2023). We acknowledge within 48 hours.</p>
            <ul>
              {store.grievance_officer && <li><span>Name</span>{store.grievance_officer}</li>}
              {(store.grievance_email || email) && <li><span>Email</span><a href={`mailto:${store.grievance_email || email}`}>{store.grievance_email || email}</a></li>}
              {(store.grievance_phone || phone) && <li><span>Phone</span>{store.grievance_phone || phone}</li>}
            </ul>
          </TiltCard>
        </aside>
      </section>

      <section className="container ct-faq">
        <h2>Quick answers</h2>
        <div className="ct-faq-list">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={'ct-q' + (open === i ? ' open' : '')}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                {q}<i className="fas fa-chevron-down"></i>
              </button>
              <div className="ct-a"><p>{a}</p></div>
            </div>
          ))}
        </div>
        <p className="ct-policies">
          <Link to="/shipping-policy">Shipping</Link> · <Link to="/refund-policy">Refunds &amp; cancellations</Link> · <Link to="/privacy-policy">Privacy</Link> · <Link to="/terms">Terms</Link>
        </p>
      </section>
    </main>
  );
}

import { Link } from 'react-router-dom';
import { useSite } from '../shop/SiteContext.jsx';
import { useSeo } from '../shop/useSeo.js';

const UPDATED = '30 September 2026';
const POLICIES = [
  ['/shipping-policy', 'Shipping Policy'],
  ['/refund-policy', 'Refund & Cancellation'],
  ['/privacy-policy', 'Privacy Policy'],
  ['/terms', 'Terms & Conditions'],
  ['/contact', 'Contact Us'],
];

// Store details used by the policies (Admin -> Settings -> Store)
function useStore() {
  const { store, content, config } = useSite();
  const footer = content?.footer || {};
  return {
    name: store.name || 'Bookends Fanny Pack',
    legal: store.legal_name || store.name || 'Bookends Fanny Pack',
    email: store.contact_email || footer.email,
    phone: store.phone || footer.phone,
    address: store.address || footer.address,
    hours: store.support_hours || footer.hours,
    gstin: store.gstin,
    fssai: store.fssai,
    grievance: {
      name: store.grievance_officer,
      email: store.grievance_email || store.contact_email,
      phone: store.grievance_phone || store.phone,
    },
    deliveryNote: config?.deliveryNote,
    gujaratOnly: config ? config.states?.length === 1 && config.states[0] === 'Gujarat' : true,
    cod: config ? config.cod !== false : true,
    shipping: config?.shipping,
  };
}

const Mail = ({ to }) => (to ? <a href={`mailto:${to}`}>{to}</a> : null);
const Tel = ({ to }) => (to ? <a href={`tel:${to.replace(/[^\d+]/g, '')}`}>{to}</a> : null);

function PolicyLayout({ title, description, children }) {
  const s = useStore();
  useSeo(title, { description });
  return (
    <main className="shop-page">
      <div className="container policy-wrap">
        <nav className="policy-crumbs"><Link to="/">Home</Link><i className="fas fa-chevron-right"></i><span>{title}</span></nav>
        <article className="policy">
          <h1 className="shop-h1">{title}</h1>
          <p className="policy-updated">Last updated: {UPDATED}</p>
          {children}
          {s.email && (
            <div className="policy-contact">
              <i className="fas fa-envelope"></i>
              <div>
                <strong>Questions?</strong>
                Write to us at <Mail to={s.email} />{s.phone ? <> or call <Tel to={s.phone} /></> : null}.
              </div>
            </div>
          )}
          <p className="policy-links">
            {POLICIES.map(([to, label], i) => (
              <span key={to}>{i > 0 && ' · '}<Link to={to}>{label}</Link></span>
            ))}
          </p>
        </article>
      </div>
    </main>
  );
}

function Grievance() {
  const s = useStore();
  const g = s.grievance;
  return (
    <>
      <h2>Grievance Officer</h2>
      <p>
        In line with the Consumer Protection (E-Commerce) Rules, 2020 and the Digital Personal Data Protection Act, 2023, you can contact
        our Grievance Officer with any complaint about an order, a product or your personal data. We acknowledge complaints within 48 hours
        and aim to resolve them within 30 days.
      </p>
      <ul className="policy-kv">
        {g.name && <li><span>Name</span>{g.name}</li>}
        {g.email && <li><span>Email</span><Mail to={g.email} /></li>}
        {g.phone && <li><span>Phone</span><Tel to={g.phone} /></li>}
        {s.address && <li><span>Address</span><span className="pre">{s.address}</span></li>}
      </ul>
    </>
  );
}

export function PrivacyPage() {
  const s = useStore();
  return (
    <PolicyLayout title="Privacy Policy" description={`How ${s.name} collects, uses and protects your personal information.`}>
      <p>
        This Privacy Policy explains how {s.legal} ("we", "us", "our"), trading as {s.name}, collects, uses and protects your personal
        information when you visit our website or buy from us. By using the website you agree to this policy.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, mobile number and password when you create an account. Your password is stored only in encrypted (hashed) form; we can never see it.</li>
        <li><strong>Order details:</strong> delivery name, phone number, address, city, state and PIN code, the products you order and the order amount. Addresses you use are saved in your address book, where you can edit or delete them.</li>
        <li><strong>Payment details:</strong> online payments are processed by Razorpay. We do <strong>not</strong> receive or store your card number, CVV, UPI PIN or net-banking password. We only receive a payment ID and the payment status.</li>
        <li><strong>Reviews and alerts:</strong> product reviews you write (shown with your first name) and the email address you give for "notify me when back in stock".</li>
        <li><strong>Technical details:</strong> your IP address and browser type, recorded for security (for example, to stop repeated failed sign-in attempts).</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To create and manage your account, and to let you reset your password.</li>
        <li>To process, pack, ship and deliver your orders, and to handle returns, refunds and cancellations.</li>
        <li>To send you emails about your orders (confirmation, shipping, delivery, cancellation and refunds) and back-in-stock alerts you asked for.</li>
        <li>To prevent fraud, misuse and unauthorised access.</li>
        <li>To meet legal, tax and accounting obligations.</li>
      </ul>
      <p>We do not sell or rent your personal information to anyone, and we do not send marketing messages unless you ask for them.</p>

      <h2>3. Who we share it with</h2>
      <p>We share only what is needed to complete your order:</p>
      <ul>
        <li><strong>Razorpay</strong>, our payment gateway, to process online payments and refunds.</li>
        <li><strong>Shipping and courier partners</strong> (such as Shiprocket and its couriers), who receive your name, phone number and delivery address to deliver your order.</li>
        <li><strong>Email service providers</strong>, to send order emails and password-reset links.</li>
        <li><strong>Government or law-enforcement authorities</strong>, when the law requires it.</li>
      </ul>

      <h2>4. Cookies and local storage</h2>
      <p>
        We use a small number of essential cookies and browser storage. A secure sign-in cookie keeps you signed in (for up to 30 days) and
        your browser remembers your cart and wishlist. We do not use advertising or tracking cookies. If you block cookies you can still
        browse, but you will not be able to sign in or check out.
      </p>

      <h2>5. How long we keep your data</h2>
      <p>
        We keep your account details for as long as your account is active. Order, invoice and payment records are kept for as long as
        Indian tax and accounting laws require, even if you close your account. Password-reset links expire after 1 hour.
      </p>

      <h2>6. How we protect your data</h2>
      <p>
        Passwords are hashed, sign-in cookies cannot be read by scripts, the website uses HTTPS, sensitive keys are encrypted on our server,
        and access to order and customer data is limited to authorised staff. No method of storing data online is 100% secure, but we take
        reasonable steps to protect your information.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can see and correct your details and addresses at any time from <Link to="/account">Your Account</Link>. You can also ask us to
        show, correct or delete your personal information, or to close your account, by emailing <Mail to={s.grievance.email || s.email} /> from
        the address linked to your account. We may keep records we are required to keep by law.
      </p>

      <h2>8. Children</h2>
      <p>Our website is not meant for children under 18. Purchases must be made by an adult or with a parent's or guardian's permission.</p>

      <h2>9. Changes to this policy</h2>
      <p>We may update this policy from time to time. The latest version is always on this page with the "Last updated" date at the top.</p>

      <Grievance />
    </PolicyLayout>
  );
}

export function TermsPage() {
  const s = useStore();
  return (
    <PolicyLayout title="Terms & Conditions" description={`The terms that apply when you shop at ${s.name}.`}>
      <p>
        These Terms &amp; Conditions apply to your use of the {s.name} website, operated by {s.legal}, and to every order you place with us.
        By using the website or placing an order, you agree to these terms. Please read them together with our{' '}
        <Link to="/privacy-policy">Privacy Policy</Link>, <Link to="/shipping-policy">Shipping Policy</Link> and{' '}
        <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
      </p>

      <h2>1. Your account</h2>
      <ul>
        <li>You must be 18 or older, or use the website with a parent's or guardian's permission.</li>
        <li>Give correct details when you sign up, and keep your email address up to date so you receive order updates.</li>
        <li>Keep your password private. You are responsible for all activity on your account.</li>
        <li>We may suspend or close accounts that give false information or misuse the website.</li>
      </ul>

      <h2>2. Products and prices</h2>
      <ul>
        <li>We try to show products, colours and descriptions accurately, but actual products may vary slightly from the photos.</li>
        <li>All prices are in Indian Rupees (₹) and include applicable taxes unless stated otherwise. Delivery charges, if any, are shown at checkout before you pay.</li>
        <li>Prices and availability can change without notice. The price you pay is the price shown when you place the order.</li>
        <li>If a product was listed at a clearly wrong price because of an error, we may cancel the order and refund you in full.</li>
        <li>For food products, please read the ingredients on the product page and on the label before buying, especially if you have allergies.{s.fssai ? ` Our FSSAI licence number is ${s.fssai}.` : ''}</li>
      </ul>

      <h2>3. Placing an order</h2>
      <ul>
        <li>You need an account to place an order.</li>
        <li>Your order is confirmed after online payment succeeds{s.cod ? ', or when you choose Cash on Delivery (COD)' : ''}. We email you a confirmation.</li>
        <li>If an online payment is not completed within 30 minutes, the order is cancelled automatically and the items are released. If money was taken after that, it is refunded automatically.</li>
        <li>Coupon codes must be entered at checkout, cannot be exchanged for cash, and can be withdrawn at any time.</li>
        <li>We may refuse or cancel an order if a product is out of stock, the address cannot be served, we suspect fraud, or there was a pricing error. If you have already paid, you will get a full refund.</li>
      </ul>

      <h2>4. Payment</h2>
      <ul>
        <li>We accept online payments (UPI, cards, net banking and wallets) through Razorpay{s.cod ? ', and Cash on Delivery where available' : ''}.</li>
        <li>Online payments are handled securely by Razorpay. We never see or store your card or banking details.</li>
        {s.cod && <li>For COD orders, please keep the exact amount ready. Repeatedly refusing COD orders may lead to COD being disabled on your account.</li>}
      </ul>

      <h2>5. Delivery</h2>
      <p>See our <Link to="/shipping-policy">Shipping Policy</Link> for where we deliver, delivery times and charges.</p>

      <h2>6. Cancellations, returns and refunds</h2>
      <p>See our <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.</p>

      <h2>7. Reviews</h2>
      <p>
        Only customers who received a product can review it. Reviews must be honest and must not contain offensive content, personal
        information or links. We may hide reviews that break these rules.
      </p>

      <h2>8. Acceptable use</h2>
      <p>
        You agree not to misuse the website: for example, not to place fake orders, try to access other people's accounts, interfere with the
        website's security, or copy our content for commercial use.
      </p>

      <h2>9. Intellectual property</h2>
      <p>The {s.name} name, logo, product names, photos and website content belong to us and may not be used without our written permission.</p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent allowed by law, our total liability for any order is limited to the amount you paid for that order. We are not
        responsible for indirect losses, or for delays caused by events outside our control.
      </p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of India. Any dispute is subject to the jurisdiction of the courts of Gujarat, India.</p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Changes apply to orders placed after the update. The latest version is always on this
        page with the "Last updated" date at the top.
      </p>

      <Grievance />
    </PolicyLayout>
  );
}

export function RefundPage() {
  const s = useStore();
  return (
    <PolicyLayout title="Refund & Cancellation Policy" description={`How to cancel an order, return a damaged item and get a refund at ${s.name}.`}>
      <h2>1. Cancelling an order</h2>
      <ul>
        <li>You can cancel an order yourself until it is handed to the courier: open the order from <Link to="/account/orders">Your Orders</Link> and choose <strong>Cancel order</strong>.</li>
        <li>If you paid online, the full amount is refunded automatically to your original payment method.</li>
        <li>Once an order has shipped it can no longer be cancelled. If you refuse a shipped order at the door, the delivery charges may be deducted from any refund.</li>
        <li>We may cancel an order ourselves (for example if an item is out of stock or the address cannot be served). You get a full refund and an email telling you why.</li>
      </ul>

      <h2>2. Returns</h2>
      <ul>
        <li><strong>Food products</strong> (Ghaslet sauces, Chilli Crisp, lemonade) cannot be returned once delivered, for hygiene and food-safety reasons.</li>
        <li>We will <strong>replace or refund</strong> any product that arrives damaged, leaking, expired, tampered with or different from what you ordered.</li>
        <li><strong>Merchandise</strong> (T-shirts, jackets, pendants) is replaced or refunded if it arrives damaged, defective or in the wrong size or design. Please keep it unused, unwashed and with its tags until we have checked it.</li>
      </ul>

      <h2>3. How to report a problem</h2>
      <p>
        Email <Mail to={s.email} /> within <strong>48 hours of delivery</strong> with your order number and
        clear photos of the product, the label and the packaging. We reply within 2 working days.
      </p>

      <h2>4. Refunds</h2>
      <ul>
        <li>Approved refunds for online payments go back to the original payment method (UPI, card, net banking or wallet).</li>
        <li>For Cash on Delivery orders, we refund to your bank account or UPI ID - we will ask you for the details by email.</li>
        <li>Refunds are issued within 2 working days of approval and usually reach you within 5-7 working days, depending on your bank.</li>
        <li>Delivery charges are refunded when the whole order is cancelled before shipping, or when the problem was our mistake.</li>
      </ul>
    </PolicyLayout>
  );
}

export function ShippingPage() {
  const s = useStore();
  const fee = s.shipping?.fee || 0;
  const freeAbove = s.shipping?.freeAbove || 0;
  return (
    <PolicyLayout title="Shipping & Delivery Policy" description={`Where ${s.name} delivers, how long it takes and what it costs.`}>
      <h2>1. Where we deliver</h2>
      <p>
        {s.deliveryNote || (s.gujaratOnly ? 'We currently deliver within Gujarat only.' : 'We deliver across India.')} You can check your PIN code at checkout
        before you pay. Orders to addresses outside our delivery area cannot be accepted.
      </p>

      <h2>2. Delivery charges</h2>
      <p>
        {fee
          ? <>Delivery costs ₹{fee} per order{freeAbove ? <>, and is <strong>free on orders of ₹{freeAbove} or more</strong></> : ''}.</>
          : <>Delivery is currently <strong>free</strong> on all orders.</>}
        {' '}The exact delivery charge is always shown at checkout before you pay.
      </p>

      <h2>3. Dispatch and delivery times</h2>
      <ul>
        <li>Orders are usually packed and handed to the courier within 1-2 working days of being placed (or of payment, for online orders).</li>
        <li>Delivery normally takes 2-5 working days after dispatch, depending on your location.</li>
        <li>Orders placed on Sundays or public holidays are processed on the next working day.</li>
        <li>Delivery times are estimates and can change because of courier delays, weather, strikes or other events outside our control.</li>
      </ul>

      <h2>4. Tracking your order</h2>
      <p>
        We email you when your order ships, when it is out for delivery and when it is delivered. You can also follow it from{' '}
        <Link to="/account/orders">Your Orders</Link>, which shows the courier name, tracking number (AWB) and a link to the courier's website.
      </p>

      <h2>5. Failed deliveries</h2>
      <p>
        Please give a complete address and a phone number that is reachable. If a delivery fails because of wrong details or because no one
        was available, the courier will try again; after repeated failures the parcel is returned to us and re-delivery charges may apply.
      </p>

      <h2>6. Damaged parcels</h2>
      <p>
        If the outer box looks damaged or tampered with, you may refuse it or accept it and report it to us within 48 hours with photos - see
        our <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
      </p>
    </PolicyLayout>
  );
}

export function ContactPage() {
  const s = useStore();
  const { content } = useSite();
  const socials = Object.entries(content?.footer?.socials || {}).filter(([, url]) => /^https?:\/\//.test(url || ''));
  return (
    <PolicyLayout title="Contact Us" description={`Get in touch with ${s.name} about an order, a product or anything else.`}>
      <p>We're happy to help with orders, deliveries, products or anything else. Please include your order number if your message is about an order.</p>
      <div className="contact-grid">
        {s.email && <div className="contact-card"><i className="fas fa-envelope"></i><strong>Email</strong><Mail to={s.email} /><small>We reply within 1 working day</small></div>}
        {s.phone && <div className="contact-card"><i className="fas fa-phone"></i><strong>Phone / WhatsApp</strong><Tel to={s.phone} />{s.hours && <small>{s.hours}</small>}</div>}
        {s.address && <div className="contact-card"><i className="fas fa-location-dot"></i><strong>Address</strong><span className="pre">{s.address}</span></div>}
        <div className="contact-card"><i className="fas fa-box"></i><strong>Your orders</strong><Link to="/account/orders">Track, cancel or get an invoice</Link><small>Sign in to see your orders</small></div>
      </div>
      {socials.length > 0 && (
        <p className="contact-socials">
          Follow us:{' '}
          {socials.map(([k, url]) => <a key={k} href={url} target="_blank" rel="noreferrer" aria-label={k}><i className={`fab fa-${k === 'twitter' ? 'x-twitter' : k}`}></i></a>)}
        </p>
      )}

      <h2>Business details</h2>
      <ul className="policy-kv">
        <li><span>Business name</span>{s.legal}</li>
        {s.address && <li><span>Registered address</span><span className="pre">{s.address}</span></li>}
        {s.gstin && <li><span>GSTIN</span>{s.gstin}</li>}
        {s.fssai && <li><span>FSSAI Lic. No.</span>{s.fssai}</li>}
      </ul>

      <Grievance />
    </PolicyLayout>
  );
}

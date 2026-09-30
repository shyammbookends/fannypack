import { getSetting, setSetting } from './settings.js';

// Homepage / site content edited in Admin -> Content.
// Stored as JSON in settings: "site.content" (published) and "site.content.draft" (being edited).
// These defaults are exactly what the site showed before the CMS existed.
export const DEFAULT_CONTENT = {
  announcement: { enabled: false, text: 'Free delivery across Gujarat', link: '/#menu' },
  nav: [
    { label: 'Home', href: '#hero' },
    { label: 'About', href: '#about' },
    { label: 'Menu', href: '#menu' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    title: 'Bold Sauces.\nCrunchy Crisp.\nZero Boring\nBites.',
    highlight: 'Crunchy',
    description: "Five bold Ghaslet hot sauces, crunchy Chilli Crisp in Jain and Non-Jain, DK's Boom Boom Lemonde and our own merch - delivered to your door across Gujarat.",
    cta_primary: { label: 'SHOP NOW', href: '#menu' },
    cta_secondary: { label: 'EXPLORE COLLECTIONS', href: '#category' },
    stats: [
      { num: 11, suffix: '', label: 'Products' },
      { num: 4, suffix: '', label: 'Collections' },
      { num: 5, suffix: '', label: 'Ghaslet Flavours' },
    ],
    bg_text: 'B & H',
    image: '/img/logo.png',
    video: '',
    show_collection_pills: true,
  },
  marquee: {
    enabled: true,
    items: [
      'Ghaslet The Classic', 'Ghaslet Tamarind Blaze', 'Ghaslet Tingle Berry', 'Ghaslet Gates of Hell',
      'Ghaslet Truffle Bomb', 'CHILLI CRISP - Jain', 'CHILLI CRISP Non-Jain', "DK'S BOOM BOOM LEMONDE",
      'T-Shirts', 'Jacket', 'Pendent',
    ],
  },
  collections_section: {
    label: 'What We Offer',
    title: 'Browse by Category',
    highlight: 'Category',
    description: 'Hot sauces, chilli crisp, lemonade and merch - pick a collection to see every flavour.',
  },
  about: {
    enabled: true,
    label: 'Our Story',
    title: 'Bold Flavours,\nMade for Everyday',
    highlight: 'Everyday',
    text: "Bookends Fanny Pack brings our favourite things together in one place: five bold Ghaslet sauces, crunchy Chilli Crisp in Jain and Non-Jain, DK's Boom Boom Lemonde and our own merchandise. Order online and we'll deliver it across Gujarat.",
    image: '/img/about-restaurant.jpg',
    small_image: '/img/about2.jpg',
    badge_number: '6+',
    badge_label: 'Years of\nExcellence',
    features: [
      { icon: 'fa-pepper-hot', tone: 'r', title: 'Bold, Unique Flavours', text: 'Five Ghaslet flavours, from The Classic to Gates of Hell, plus Chilli Crisp in Jain and Non-Jain.' },
      { icon: 'fa-shield-halved', tone: 'y', title: 'Safe & Easy Payment', text: 'Pay online with UPI, cards or net banking through Razorpay, or choose Cash on Delivery.' },
      { icon: 'fa-shipping-fast', tone: 'g', title: 'Delivery Across Gujarat', text: 'We ship to every PIN code in Gujarat, and you can track your order until it reaches you.' },
    ],
    button: { label: 'View Full Menu', href: '#menu' },
  },
  menu_section: { label: "What's", title: 'Our Menu', highlight: 'Menu' },
  promos: [
    {
      id: 'special', enabled: true, variant: '', reverse: false,
      tag: '🔥 5 Flavours. 1 Bold Experience.',
      title: 'Your Food.\nOur Heat.\nZero Boring Bites.', highlight: 'Heat.',
      items: ['The Classic', 'Tamarind Blaze', 'Tingle Berry', 'Gates of Hell', 'Truffle Bomb'],
      button: 'DISCOVER THE HEAT', collection: 'ghaslate', image: '/img/ghaslet-banner-2.jpg',
    },
    {
      id: 'special-crisp', enabled: true, variant: 'crisp', reverse: true,
      tag: '🌶️ Crunchy • Spicy • Addictive',
      title: 'Your Food.\nOur Crunch.\nZero Boring Bites.', highlight: 'Crunch.',
      items: ['Chilli Crisp', 'Bold Crunch', 'Big Flavour'],
      button: 'DISCOVER THE CRUNCH', collection: 'chilli-crisp', image: '/img/products/chilli-crisp-banner.jpg',
    },
    {
      id: 'special-merch', enabled: true, variant: 'merch', reverse: false,
      tag: '🔥 Wear The Vibe.',
      title: 'Your Style.\nOur Energy.\nZero Ordinary Fits.', highlight: 'Energy.',
      items: ['Friends of Capiche', 'Capiche Pendant', 'Capiche Jacket'],
      button: 'EXPLORE THE MERCH', collection: 'merchenties', image: '',
    },
  ],
  effects: { ribbons: true, ring: true, ring_speed: 36 },
  footer: {
    description: "Bold Ghaslet sauces, crunchy Chilli Crisp, DK's Boom Boom Lemonde and our own merch, delivered to your door across Gujarat.",
    address: '',
    phone: '',
    email: 'shyamm.bookends@gmail.com',
    hours: '',
    socials: { facebook: '', instagram: '', twitter: '', youtube: '', tiktok: '' },
    copyright: 'Bookends Fanny Pack',
  },
};

// Merge stored content over the defaults (one level deep per section)
function merge(stored) {
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_CONTENT)) {
    const v = stored?.[k];
    if (v === undefined) out[k] = def;
    else if (def && typeof def === 'object' && !Array.isArray(def) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...def, ...v };
    else out[k] = v;
  }
  return out;
}

export async function getPublishedContent() {
  return merge(await getSetting('site.content'));
}

export async function getDraftContent() {
  const draft = await getSetting('site.content.draft');
  return draft ? merge(draft) : getPublishedContent();
}

export async function saveDraftContent(content) {
  return setSetting('site.content.draft', merge(content));
}

export async function publishContent() {
  const draft = await getDraftContent();
  await setSetting('site.content', draft);
  return draft;
}

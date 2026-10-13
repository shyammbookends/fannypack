import { useEffect } from 'react';

const STORE = 'Bookends Fanny Pack';

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

// Page title + description (+ share tags) while the page is open.
// The server sends the same tags for crawlers; this keeps them right as the shopper navigates.
export function useSeo(title, { description, image, noindex = false } = {}) {
  useEffect(() => {
    if (title === undefined) return;
    document.title = title ? `${title} | ${STORE}` : STORE;
    setMeta('property', 'og:title', document.title);
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
    }
    if (image) setMeta('property', 'og:image', new URL(image, window.location.origin).href);
    setMeta('name', 'robots', noindex ? 'noindex' : null);
  }, [title, description, image, noindex]);
}

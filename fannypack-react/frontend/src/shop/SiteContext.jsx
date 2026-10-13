import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Homepage content (Admin -> Content), collections, store details and checkout config.
// In production the server embeds the content in the page (#site-data), so the first
// paint is complete; in development (or if that is missing) it is fetched.
const SiteContext = createContext(null);

function embedded() {
  try {
    const el = document.getElementById('site-data');
    return el ? JSON.parse(el.textContent) : null;
  } catch {
    return null;
  }
}

export function SiteProvider({ children }) {
  const [initial] = useState(embedded);
  const [site, setSite] = useState(initial);
  const [config, setConfig] = useState(initial?.config || null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.content().then(setSite, (err) => setError(err.message));
  }, []);

  useEffect(() => {
    // The server embeds fresh data in every page (the HTML is never cached), so only fetch
    // what is missing (development server, or an older cached page without it).
    if (!initial?.content) load();
    if (!initial?.config) {
      api.config().then(setConfig).catch(() => setConfig({ razorpay: false, cod: true, storeOpen: true, states: [] }));
    }
  }, [initial, load]);

  const value = useMemo(
    () => ({
      ready: Boolean(site),
      error,
      retry: load,
      content: site?.content || null,
      categories: site?.categories || [],
      store: site?.store || { name: 'Bookends Fanny Pack' },
      seo: site?.seo || {},
      config,
    }),
    [site, error, load, config]
  );
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);

// "Line one\nLine two" with one highlighted word/phrase -> JSX
export function Highlighted({ text, highlight }) {
  const lines = String(text || '').split('\n');
  return lines.map((line, i) => {
    const at = highlight ? line.indexOf(highlight) : -1;
    return (
      <Fragment key={i}>
        {i > 0 && <br />}
        {at < 0 ? line : <>{line.slice(0, at)}<span>{highlight}</span>{line.slice(at + highlight.length)}</>}
      </Fragment>
    );
  });
}

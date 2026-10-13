import { useSite } from '../shop/SiteContext.jsx';

export default function Marquee() {
  const { content } = useSite();
  const list = content.marquee?.enabled === false ? [] : content.marquee?.items || [];
  if (!list.length) return null;
  // Items are rendered twice so the CSS scroll loops seamlessly
  const items = [...list, ...list];
  return (
    <div className="mqsec" aria-hidden="true">
      <div className="mqtrack">
        {items.map((m, i) => (
          <div className="mqitem" key={i}><i className="fas fa-circle"></i>{m}</div>
        ))}
      </div>
    </div>
  );
}

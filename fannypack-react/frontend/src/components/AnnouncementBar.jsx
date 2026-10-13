import { Link } from 'react-router-dom';
import { useSite } from '../shop/SiteContext.jsx';

// Thin bar above the navbar (Admin -> Content -> Announcement bar), or the "store closed" notice
export default function AnnouncementBar() {
  const { content, config } = useSite();
  if (config && config.storeOpen === false) {
    return <div className="announce closed" role="status"><i className="fas fa-store-slash"></i> {config.closedMessage || 'We are not taking orders right now.'}</div>;
  }
  const a = content?.announcement;
  if (!a?.enabled || !a.text) return null;
  const link = a.link || '';
  return (
    <div className="announce" role="status">
      {link.startsWith('/') ? <Link to={link}>{a.text}</Link> : /^https?:\/\//.test(link) ? <a href={link}>{a.text}</a> : link.startsWith('#') ? <a href={link}>{a.text}</a> : a.text}
    </div>
  );
}

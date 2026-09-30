import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';

export function Stars({ value, size }) {
  const full = Math.round(Number(value) || 0);
  return (
    <span className={'stars' + (size ? ` stars-${size}` : '')} aria-label={`${Number(value || 0).toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={(n <= full ? 'fas' : 'far') + ' fa-star'}></i>)}
    </span>
  );
}

function ReviewForm({ slug, mine, onSaved }) {
  const [rating, setRating] = useState(mine?.rating || 0);
  const [title, setTitle] = useState(mine?.title || '');
  const [body, setBody] = useState(mine?.body || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating.');
    setBusy(true);
    setError('');
    try {
      await api.saveReview(slug, { rating, title, body });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="rv-form" onSubmit={submit} noValidate>
      <h3>{mine ? 'Edit your review' : 'Write a review'}</h3>
      <div className="rv-pick" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}>
            <i className={(n <= rating ? 'fas' : 'far') + ' fa-star'}></i>
          </button>
        ))}
      </div>
      <input className="co-input" placeholder="Headline (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Headline" />
      <textarea className="co-input" rows={4} placeholder="What did you like or dislike? How spicy was it?" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} aria-label="Review" />
      {error && <div className="cart-err">{error}</div>}
      <button className="pd-btn pd-btn-buy" disabled={busy}>{busy ? 'Saving…' : 'Submit review'}</button>
      {mine?.status === 'hidden' && <p className="pd-muted">Your previous review was hidden by the store.</p>}
    </form>
  );
}

// Ratings summary, the list, and a form for customers who received the product
export default function Reviews({ slug }) {
  const { user } = useAuth();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => api.reviews(slug).then(setData).catch(() => setData({ count: 0, average: 0, items: [] })), [slug]);
  useEffect(() => {
    setEditing(false);
    load();
  }, [load]);

  // "#reviews" link from an order: scroll here once loaded
  useEffect(() => {
    if (data && location.hash === '#reviews') document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
  }, [data, location.hash]);

  if (!data) return null;
  const removeMine = async () => {
    if (!window.confirm('Delete your review?')) return;
    await api.deleteReview(slug).catch(() => {});
    load();
  };

  return (
    <section className="pd-block rv" id="reviews">
      <h2>Customer reviews</h2>
      <div className="rv-top">
        <div className="rv-summary">
          {data.count > 0 ? (
            <>
              <div className="rv-avg"><strong>{data.average.toFixed(1)}</strong> <Stars value={data.average} /></div>
              <span>{data.count} rating{data.count > 1 ? 's' : ''}</span>
              <div className="rv-bars">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = data.breakdown?.[n] || 0;
                  return (
                    <div key={n} className="rv-bar">
                      <span>{n} star</span>
                      <div><i style={{ width: `${data.count ? (c / data.count) * 100 : 0}%` }}></i></div>
                      <span>{c}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="pd-muted">No reviews yet.</p>
          )}
        </div>
        <div className="rv-cta">
          {!user && <p className="pd-muted"><Link to={`/signin?next=${encodeURIComponent(location.pathname + '#reviews')}`}>Sign in</Link> to review a product you've received.</p>}
          {user && !data.canReview && !data.mine && <p className="pd-muted">You can review this product once an order containing it has been delivered to you.</p>}
          {user && data.canReview && (!data.mine || editing) && <ReviewForm slug={slug} mine={data.mine} onSaved={() => { setEditing(false); load(); }} />}
          {user && data.mine && !editing && (
            <div className="rv-mine">
              <p>Thanks for your review!</p>
              {data.canReview && <button type="button" className="acct-link-btn" onClick={() => setEditing(true)}>Edit</button>}
              <button type="button" className="acct-link-btn" onClick={removeMine}>Delete</button>
            </div>
          )}
        </div>
      </div>
      <div className="rv-list">
        {data.items.map((r) => (
          <article key={r.id} className="rv-item">
            <div className="rv-head"><Stars value={r.rating} size="sm" />{r.title && <strong>{r.title}</strong>}</div>
            <div className="rv-by">{r.author}{r.mine ? ' (you)' : ''} · <span className="rv-verified"><i className="fas fa-circle-check"></i> Verified purchase</span> · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            {r.body && <p>{r.body}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { get, post, put } from '../api.js';
import { Btn, Card, ErrorBox, Field, ImageField, Input, ListInput, PageHeader, Spinner, Tabs, Textarea, Toggle, useAsync, useUi } from '../ui.jsx';

// Small helpers to edit nested content immutably
const setIn = (obj, path, value) => {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = setIn(obj?.[k], rest, value);
  return copy;
};

const SECTIONS = [
  { key: 'hero', label: 'Hero' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'marquee', label: 'Marquee' },
  { key: 'sections', label: 'Section titles' },
  { key: 'about', label: 'About' },
  { key: 'promos', label: 'Promo banners' },
  { key: 'footer', label: 'Footer' },
  { key: 'effects', label: 'Effects' },
];

export default function Content() {
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useAsync(() => get('/content'), []);
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('hero');
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setC(data.draft);
      setDirty(false);
    }
  }, [data]);

  useEffect(() => {
    if (!dirty) return;
    const f = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirty]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!c) return null;

  const upd = (path, v) => {
    setC((x) => setIn(x, path, v));
    setDirty(true);
  };
  const bind = (path) => ({ value: path.reduce((o, k) => o?.[k], c) ?? '', onChange: (e) => upd(path, e.target.value) });

  const saveDraft = async () => {
    setBusy('save');
    try {
      await put('/content', { content: c });
      toast('Draft saved. Publish to show it on the store.');
      await reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy('');
    }
  };
  const publish = async () => {
    if (!(await confirm({ title: 'Publish changes?', message: 'The live store will show this content right away.', confirmLabel: 'Publish' }))) return;
    setBusy('publish');
    try {
      await put('/content', { content: c });
      await post('/content/publish');
      toast('Published. The store is updated.');
      await reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy('');
    }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Discard draft?', message: 'Unpublished changes will be lost and the editor will go back to what is live now.', danger: true, confirmLabel: 'Discard' }))) return;
    setBusy('discard');
    try {
      await post('/content/discard');
      toast('Draft discarded');
      await reload();
    } catch (err) {
      toast(err.message, 'critical');
    } finally {
      setBusy('');
    }
  };

  const pending = dirty || data.unpublished;
  return (
    <>
      <PageHeader
        title="Content"
        subtitle={pending ? 'You have changes that are not live yet.' : 'Everything here is live on the store.'}
        actions={
          <>
            <a className="adm-btn secondary" href="/" target="_blank" rel="noreferrer"><i className="fas fa-eye" /><span>View store</span></a>
            {data.unpublished && !dirty && <Btn variant="ghost" loading={busy === 'discard'} onClick={discard}>Discard draft</Btn>}
            <Btn loading={busy === 'save'} disabled={!dirty} onClick={saveDraft}>Save draft</Btn>
            <Btn variant="primary" icon="fa-upload" loading={busy === 'publish'} disabled={!pending} onClick={publish}>Publish</Btn>
          </>
        }
      />
      <Tabs tabs={SECTIONS} value={tab} onChange={setTab} />

      {tab === 'hero' && (
        <Card title="Hero (top of the homepage)">
          <Field label="Title" hint="Each line break becomes a new line on the site."><Textarea rows={4} {...bind(['hero', 'title'])} /></Field>
          <Field label="Highlighted word" hint="Shown in the accent colour. Must appear in the title."><Input {...bind(['hero', 'highlight'])} /></Field>
          <Field label="Description"><Textarea rows={3} {...bind(['hero', 'description'])} /></Field>
          <div className="adm-form-grid">
            <Field label="Main button text"><Input {...bind(['hero', 'cta_primary', 'label'])} /></Field>
            <Field label="Main button link"><Input {...bind(['hero', 'cta_primary', 'href'])} /></Field>
            <Field label="Second button text"><Input {...bind(['hero', 'cta_secondary', 'label'])} /></Field>
            <Field label="Second button link"><Input {...bind(['hero', 'cta_secondary', 'href'])} /></Field>
            <Field label="Background text"><Input {...bind(['hero', 'bg_text'])} /></Field>
          </div>
          <ImageField label="Circle image" value={c.hero.image} onChange={(v) => upd(['hero', 'image'], v)} />
          <ImageField label="Background video (optional)" type="videos" accept="video/mp4,video/webm" value={c.hero.video} onChange={(v) => upd(['hero', 'video'], v)} />
          <Toggle checked={c.hero.show_collection_pills} onChange={(v) => upd(['hero', 'show_collection_pills'], v)} label="Show collection pills around the circle" />
          <h4 className="adm-section-title" style={{ marginTop: 16 }}>Stats</h4>
          {c.hero.stats.map((s, i) => (
            <div key={i} className="adm-form-grid" style={{ gridTemplateColumns: '1fr 1fr 2fr auto', alignItems: 'end' }}>
              <Field label="Number"><Input type="number" value={s.num} onChange={(e) => upd(['hero', 'stats', i, 'num'], Number(e.target.value))} /></Field>
              <Field label="Suffix"><Input {...bind(['hero', 'stats', i, 'suffix'])} /></Field>
              <Field label="Label"><Input {...bind(['hero', 'stats', i, 'label'])} /></Field>
              <Btn variant="ghost" icon="fa-trash" aria-label="Remove stat" onClick={() => upd(['hero', 'stats'], c.hero.stats.filter((_, j) => j !== i))} />
            </div>
          ))}
          {c.hero.stats.length < 4 && <Btn size="sm" icon="fa-plus" onClick={() => upd(['hero', 'stats'], [...c.hero.stats, { num: 0, suffix: '', label: '' }])}>Add stat</Btn>}
        </Card>
      )}

      {tab === 'announcement' && (
        <Card title="Announcement bar" subtitle="A thin bar at the very top of the store">
          <Toggle checked={c.announcement.enabled} onChange={(v) => upd(['announcement', 'enabled'], v)} label="Show announcement bar" />
          <Field label="Text"><Input {...bind(['announcement', 'text'])} /></Field>
          <Field label="Link (optional)"><Input {...bind(['announcement', 'link'])} /></Field>
        </Card>
      )}

      {tab === 'marquee' && (
        <Card title="Scrolling marquee">
          <Toggle checked={c.marquee.enabled} onChange={(v) => upd(['marquee', 'enabled'], v)} label="Show marquee" />
          <Field label="Items" hint="Press Enter after each item."><ListInput value={c.marquee.items} onChange={(v) => upd(['marquee', 'items'], v)} placeholder="Add item…" /></Field>
        </Card>
      )}

      {tab === 'sections' && (
        <div className="adm-grid cols-2">
          <Card title="Category section">
            <Field label="Small label"><Input {...bind(['collections_section', 'label'])} /></Field>
            <Field label="Title"><Input {...bind(['collections_section', 'title'])} /></Field>
            <Field label="Highlighted word"><Input {...bind(['collections_section', 'highlight'])} /></Field>
            <Field label="Description"><Textarea rows={3} {...bind(['collections_section', 'description'])} /></Field>
          </Card>
          <Card title="Menu section">
            <Field label="Small label"><Input {...bind(['menu_section', 'label'])} /></Field>
            <Field label="Title"><Input {...bind(['menu_section', 'title'])} /></Field>
            <Field label="Highlighted word"><Input {...bind(['menu_section', 'highlight'])} /></Field>
            <p className="adm-muted" style={{ fontSize: 13 }}>Menu items come from Products and Collections.</p>
          </Card>
        </div>
      )}

      {tab === 'about' && (
        <Card title="About section">
          <Toggle checked={c.about.enabled} onChange={(v) => upd(['about', 'enabled'], v)} label="Show about section" />
          <div className="adm-form-grid">
            <Field label="Small label"><Input {...bind(['about', 'label'])} /></Field>
            <Field label="Highlighted words"><Input {...bind(['about', 'highlight'])} /></Field>
          </div>
          <Field label="Title"><Textarea rows={2} {...bind(['about', 'title'])} /></Field>
          <Field label="Text"><Textarea rows={4} {...bind(['about', 'text'])} /></Field>
          <div className="adm-form-grid">
            <Field label="Badge number"><Input {...bind(['about', 'badge_number'])} /></Field>
            <Field label="Badge label"><Textarea rows={2} {...bind(['about', 'badge_label'])} /></Field>
            <Field label="Button text"><Input {...bind(['about', 'button', 'label'])} /></Field>
            <Field label="Button link"><Input {...bind(['about', 'button', 'href'])} /></Field>
          </div>
          <ImageField label="Main image" value={c.about.image} onChange={(v) => upd(['about', 'image'], v)} />
          <ImageField label="Small image" value={c.about.small_image} onChange={(v) => upd(['about', 'small_image'], v)} />
          <h4 className="adm-section-title" style={{ marginTop: 16 }}>Features</h4>
          {c.about.features.map((f, i) => (
            <div key={i} className="adm-variant">
              <div className="adm-form-grid">
                <Field label="Title"><Input {...bind(['about', 'features', i, 'title'])} /></Field>
                <Field label="Icon" hint="Font Awesome name"><Input {...bind(['about', 'features', i, 'icon'])} /></Field>
              </div>
              <Field label="Text"><Textarea rows={2} {...bind(['about', 'features', i, 'text'])} /></Field>
              <Btn size="sm" variant="ghost" icon="fa-trash" onClick={() => upd(['about', 'features'], c.about.features.filter((_, j) => j !== i))}>Remove</Btn>
            </div>
          ))}
          {c.about.features.length < 4 && <Btn size="sm" icon="fa-plus" onClick={() => upd(['about', 'features'], [...c.about.features, { icon: 'fa-star', tone: 'r', title: '', text: '' }])}>Add feature</Btn>}
        </Card>
      )}

      {tab === 'promos' && (
        <div className="adm-stack">
          {c.promos.map((p, i) => (
            <Card key={p.id || i} title={`Banner ${i + 1}`} actions={<Toggle checked={p.enabled} onChange={(v) => upd(['promos', i, 'enabled'], v)} label="Visible" />}>
              <Field label="Tag line"><Input {...bind(['promos', i, 'tag'])} /></Field>
              <Field label="Title" hint="Line breaks are kept."><Textarea rows={3} {...bind(['promos', i, 'title'])} /></Field>
              <div className="adm-form-grid">
                <Field label="Highlighted word"><Input {...bind(['promos', i, 'highlight'])} /></Field>
                <Field label="Button text"><Input {...bind(['promos', i, 'button'])} /></Field>
                <Field label="Button opens collection" hint="Collection URL, e.g. ghaslate"><Input {...bind(['promos', i, 'collection'])} /></Field>
              </div>
              <Field label="List items"><ListInput value={p.items} onChange={(v) => upd(['promos', i, 'items'], v)} placeholder="Add item…" /></Field>
              <ImageField label="Image" value={p.image} onChange={(v) => upd(['promos', i, 'image'], v)} />
              <Toggle checked={p.reverse} onChange={(v) => upd(['promos', i, 'reverse'], v)} label="Image on the left" />
            </Card>
          ))}
        </div>
      )}

      {tab === 'footer' && (
        <Card title="Footer">
          <Field label="Description"><Textarea rows={3} {...bind(['footer', 'description'])} /></Field>
          <div className="adm-form-grid">
            <Field label="Address"><Input {...bind(['footer', 'address'])} /></Field>
            <Field label="Phone"><Input {...bind(['footer', 'phone'])} /></Field>
            <Field label="Email"><Input type="email" {...bind(['footer', 'email'])} /></Field>
            <Field label="Opening hours"><Input {...bind(['footer', 'hours'])} /></Field>
            <Field label="Copyright name"><Input {...bind(['footer', 'copyright'])} /></Field>
          </div>
          <h4 className="adm-section-title" style={{ marginTop: 12 }}>Social links</h4>
          <div className="adm-form-grid">
            {Object.keys(c.footer.socials || {}).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input {...bind(['footer', 'socials', k])} placeholder="https://" /></Field>
            ))}
          </div>
        </Card>
      )}

      {tab === 'effects' && (
        <Card title="Visual effects" subtitle="Turn heavy animations off if the site feels slow on phones">
          <div className="adm-stack">
            <Toggle checked={c.effects.ribbons} onChange={(v) => upd(['effects', 'ribbons'], v)} label="3D ribbons between Ghaslet and Chilli Crisp" />
            <Toggle checked={c.effects.ring} onChange={(v) => upd(['effects', 'ring'], v)} label="3D ring before the merch section" />
            <Field label="Ring speed (seconds per turn)"><Input type="number" min="8" max="120" value={c.effects.ring_speed} onChange={(e) => upd(['effects', 'ring_speed'], Number(e.target.value) || 36)} /></Field>
          </div>
        </Card>
      )}
    </>
  );
}

// Builds a small Font Awesome subset for the site: only the icons the code (and the database
// content) actually uses, in the three styles the site uses (solid, regular, brands).
// Output: src/assets/css/icons.css + src/assets/webfonts/fp-*.woff2 (a few KB instead of ~800 KB CSS + 650 KB fonts).
//
// Usage:  npm run icons      (needs Python with fonttools + brotli: pip install fonttools brotli)
// Run it again after using a new icon name anywhere (JSX, Admin -> Content / Collections icon fields).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BACKEND = path.resolve(ROOT, '../backend');
// database settings + driver come from the backend folder (the frontend has no database access of its own)
const backendRequire = createRequire(path.join(BACKEND, 'package.json'));
try {
  backendRequire('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });
} catch {
  /* backend not installed: scan the code only */
}
const CSS_IN = path.join(ROOT, 'src/assets/css/all.min.css');
const FONT_DIR = path.join(ROOT, 'src/assets/webfonts');
const CSS_OUT = path.join(ROOT, 'src/assets/css/icons.css');

// icon names built at runtime (template strings) that a text scan cannot see
const ALWAYS = [
  'fa-facebook', 'fa-facebook-f', 'fa-instagram', 'fa-x-twitter', 'fa-twitter', 'fa-youtube', 'fa-tiktok', 'fa-whatsapp',
  'fa-tag', 'fa-star', 'fa-image', 'fa-pepper-hot', 'fa-fire-flame-curved', 'fa-lemon', 'fa-shirt', 'fa-gem', 'fa-vest',
  'fa-shield-halved', 'fa-shipping-fast', 'fa-truck-fast', 'fa-circle-check', 'fa-circle-exclamation', 'fa-circle-info',
  'fa-triangle-exclamation', 'fa-circle-xmark', 'fa-spinner', 'fa-check',
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'assets', 'dist'].includes(e.name)) await walk(p, out);
    } else if (/\.(jsx?|mjs|sql)$/.test(e.name)) out.push(p);
  }
  return out;
}

// 1. every "fa-xxx" token in the code and saved content
const used = new Set(ALWAYS);
const files = [...(await walk(path.join(ROOT, 'src'))), ...(await walk(BACKEND))];
for (const f of files) for (const m of (await readFile(f, 'utf8')).matchAll(/fa-[a-z0-9]+(?:-[a-z0-9]+)*/g)) used.add(m[0]);
if (process.env.DATABASE_URL) {
  try {
    const pg = backendRequire('pg');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const { rows } = await db.query(`SELECT icon AS t FROM categories UNION ALL SELECT value::text FROM settings`);
    for (const r of rows) for (const m of String(r.t || '').matchAll(/fa-[a-z0-9]+(?:-[a-z0-9]+)*/g)) used.add(m[0]);
    await db.end();
  } catch (err) {
    console.warn('Database not reachable, scanning code only:', err.message);
  }
}

// 2. pick the CSS rules for those icons
const css = await readFile(CSS_IN, 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const glyph = new Map(); // name -> "\fxxx"
const extra = []; // modifier rules (fa-spin, fa-fw, ...)
for (const r of rules) {
  const names = [...r.sel.matchAll(/\.(fa-[a-z0-9-]+)/g)].map((m) => m[1]);
  const content = /content:"(\\[0-9a-f]+)"/.exec(r.body);
  if (content && /:before/.test(r.sel)) {
    for (const s of r.sel.split(',')) {
      const n = /^\.(fa-[a-z0-9-]+):before$/.exec(s.trim());
      if (n) glyph.set(n[1], content[1]);
    }
  } else if (!content && names.length && names.every((n) => used.has(n)) && !/:after|fad|fa-duotone|fa-light|fa-thin|fal|fat/.test(r.sel)) {
    extra.push(`${r.sel}{${r.body}}`);
  }
}
// newer Font Awesome names used in the code -> the same icon in this (6.0) font
const ALIAS = { 'fa-shield-halved': 'fa-shield-alt', 'fa-x-twitter': 'fa-twitter', 'fa-boxes-packing': 'fa-boxes-stacked', 'fa-file-circle-question': 'fa-file-magnifying-glass' };
for (const [name, to] of Object.entries(ALIAS)) if (used.has(name) && !glyph.has(name) && glyph.has(to)) glyph.set(name, glyph.get(to));
const icons = [...used].filter((n) => glyph.has(n)).sort();
const keyframes = [...css.matchAll(/@keyframes (fa-[a-z-]+)\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g)]
  .filter((m) => extra.some((e) => e.includes(m[1])))
  .map((m) => m[0]);

// 3. subset the three fonts to those code points
const codepoints = [...new Set(icons.map((n) => glyph.get(n).slice(1)))];
const fonts = [['fa-solid-900', 'fp-solid'], ['fa-regular-400', 'fp-regular'], ['fa-brands-400', 'fp-brands']];
for (const [src, out] of fonts) {
  execFileSync('python', ['-m', 'fontTools.subset', path.join(FONT_DIR, `${src}.ttf`),
    `--unicodes=${codepoints.map((c) => `U+${c}`).join(',')}`, '--flavor=woff2', '--layout-features=*', '--no-hinting',
    `--output-file=${path.join(FONT_DIR, `${out}.woff2`)}`], { stdio: 'inherit' });
}

// 4. the stylesheet
const out = `/* Font Awesome subset - generated by scripts/build-icons.mjs (npm run icons). Do not edit by hand.
   Icons: ${icons.length}. Font Awesome by Fonticons, Inc. - https://fontawesome.com */
@font-face{font-family:"FP Icons";font-style:normal;font-weight:900;font-display:block;src:url(../webfonts/fp-solid.woff2) format("woff2")}
@font-face{font-family:"FP Icons";font-style:normal;font-weight:400;font-display:block;src:url(../webfonts/fp-regular.woff2) format("woff2")}
@font-face{font-family:"FP Icons Brands";font-style:normal;font-weight:400;font-display:block;src:url(../webfonts/fp-brands.woff2) format("woff2")}
.fa,.fa-solid,.fa-regular,.fa-brands,.fas,.far,.fab{-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;display:var(--fa-display,inline-block);font-style:normal;font-variant:normal;line-height:1;text-rendering:auto}
.fa,.fa-solid,.fas{font-family:"FP Icons";font-weight:900}
.fa-regular,.far{font-family:"FP Icons";font-weight:400}
.fa-brands,.fab{font-family:"FP Icons Brands";font-weight:400}
${extra.join('\n')}
${keyframes.join('\n')}
${icons.map((n) => `.${n}:before{content:"${glyph.get(n)}"}`).join('\n')}
`;
await writeFile(CSS_OUT, out);
console.log(`icons.css: ${icons.length} icons, ${extra.length} helper rules; unknown names ignored: ${[...used].filter((n) => !glyph.has(n) && !extra.some((e) => e.includes(`.${n}`))).length}`);

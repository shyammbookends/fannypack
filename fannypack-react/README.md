# Bookends Fanny Pack - Website + Shop

React (Vite) website with a shop and an admin panel, backed by an Express API on PostgreSQL.

```text
fannypack-react/
|-- frontend/   React website + admin panel (Vite)        -> frontend/.env
|-- backend/    Express API, database, emails, payments   -> backend/.env
|-- firebase.json, .firebaserc, Dockerfile, vercel.json   -> hosting (see below)
`-- package.json                                           -> runs both together
```

## Run it (development)

```bash
cd "F:\ends\Fannypack main\fannypack-react"
npm run install:all   # first time only: installs root, backend and frontend packages
npm run db:migrate    # creates / updates the database tables (safe to re-run)
npm run dev           # API on :5000 + website on http://localhost:5173
```

Each part also runs on its own: `cd backend && npm run dev`, `cd frontend && npm run dev`.

First time on a new database: `npm run admin:create` makes the first admin (then sign in at `/admin`).

## Settings (.env files)

- **`backend/.env`**: all secrets (database, encryption key, Razorpay, SMTP). Copy `backend/.env.example` if it is missing.
- **`frontend/.env`**: only development settings (`VITE_API_PROXY`, `VITE_PORT`). Never put secrets here:
  everything in the frontend ends up in the browser.

| Key (backend/.env) | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `DB_POOL_MAX` | Database connections per server (default 20) |
| `PORT` | API port (default 5000; Cloud Run sets 8080 itself) |
| `NODE_ENV` | **`production` on the live server** (secure cookies, HTTPS headers, no emails in logs) |
| `PUBLIC_URL` | Public address of the site (email links, sitemap, share tags) |
| `ENCRYPTION_KEY` | 64 hex characters; encrypts integration secrets, 2FA keys and backups |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay keys (or Admin -> Integrations). Empty = Cash on Delivery only |
| `SMTP_*` | Email. Without it, emails are printed in the server console |
| `TRUST_PROXY` | Number of proxies in front (Nginx = 1, Firebase Hosting -> Cloud Run = 2) |

## Go live on your own server (VPS)

```bash
npm run install:all
npm run db:migrate
npm run build        # builds the website into frontend/dist
npm start            # backend serves the API + the built website on one port
```

Put it behind HTTPS (Nginx / Caddy) and set `TRUST_PROXY=1`. Health check: `GET /api/health`.

## Host on Firebase

Firebase Hosting serves the website files from its CDN; everything dynamic (API, pages with their SEO tags,
photos with WebP) goes to the backend running on **Google Cloud Run**. Nothing is deployed until you run these.

1. Install the tools: `npm i -g firebase-tools`, plus the Google Cloud CLI (`gcloud`). Run `firebase login`.
2. Put your Firebase project id in `.firebaserc`.
3. Database: create a PostgreSQL database (Cloud SQL, Neon, Supabase...). From your PC, point `backend/.env`
   `DATABASE_URL` at it and run `npm run db:migrate`, then `npm run admin:create`.
4. Photos uploaded in the admin must survive restarts: create a Cloud Storage bucket, copy `backend/uploads/`
   into it once, and mount it on Cloud Run at `/app/backend/uploads` (step 5).
5. Deploy the backend (from this folder; service name and region must match `firebase.json`):
   ```bash
   gcloud run deploy fannypack --source . --region asia-south1 --allow-unauthenticated \
     --min-instances 1 --max-instances 10 --concurrency 250 --no-cpu-throttling \
     --add-volume name=uploads,type=cloud-storage,bucket=YOUR_BUCKET \
     --add-volume-mount volume=uploads,mount-path=/app/backend/uploads \
     --set-env-vars NODE_ENV=production,PUBLIC_URL=https://your-domain,TRUST_PROXY=2,DB_POOL_MAX=10 \
     --set-secrets DATABASE_URL=fp-database-url:latest,ENCRYPTION_KEY=fp-encryption-key:latest
   ```
   (Keep secrets in Secret Manager, never in the command line or the image. Add the SMTP/Razorpay ones the same way.)
6. Deploy the website: `npm run deploy:hosting`. Always deploy both after a change, so both use the same build.

Notes:
- Sign-in uses one cookie named `__session`: the only cookie Firebase Hosting passes to Cloud Run.
- `max-instances x DB_POOL_MAX` must stay below the database's connection limit (10 x 10 = 100).
- `--no-cpu-throttling` + `--min-instances 1` keep the background jobs running (unpaid-order release,
  tracking sync, session cleanup).
- Public pages and catalogue data are cached by the CDN for 30 seconds, so admin changes can take up to
  30 seconds to show for visitors.

## Host the website on Vercel

`vercel.json` builds only the website (Root Directory in Vercel: `fannypack-react`): it installs the
frontend packages, runs the Vite build and serves `frontend/dist`. Vercel does not run the Express backend, so
the shop, sign-in, cart and admin need the backend hosted elsewhere (Cloud Run, Render, a VPS...). When it is live,
add this as the FIRST entry of `rewrites` in `vercel.json` (and set the backend's `PUBLIC_URL` to the Vercel address):

```json
{ "source": "/:path(api|uploads|sitemap.xml|robots.txt)/:rest*", "destination": "https://YOUR-BACKEND-URL/:path/:rest*" }
```

## Traffic

One backend process (tested on this PC with 6,000 simultaneous connections) answered every request without a
single failure: ~4,200 page views/second for the homepage, ~10,000/second for the product list. 6,000 people on
the site at once make only a few hundred requests a second, so one server has plenty of room. On Firebase the
CDN answers most of them before they reach the server, and Cloud Run starts more copies when needed.

Why it is fast: product, collection and homepage data are cached in memory (refreshed as soon as the admin
saves anything), already compressed, and served without touching the database; the product page and the
product API read the same cache.

## Backups

```bash
npm run db:backup                                              # backend/backups/db-YYYY-MM-DD-HHMM.json (keeps 30)
npm --prefix backend run db:restore -- backups/db-....json --yes  # replaces ALL data with the backup
```

Schedule `npm run db:backup` daily and copy `backend/backups/` and `backend/uploads/` to another disk or cloud
storage. Backups are encrypted with `ENCRYPTION_KEY`: keep a safe copy of that key.
`npm --prefix backend run db:schema` regenerates `backend/migrations/000_base.sql` (the full table structure).

## Speed tools (frontend)

| Command (in `frontend/`) | When to run it |
| --- | --- |
| `npm run images` | After adding photos to `public/img` or uploading in the admin. Makes WebP copies. Needs Python + Pillow. |
| `npm run icons` | After using a new Font Awesome icon name. Rebuilds the small icon font. Needs Python + fonttools + brotli. |
| `npm run css:purge` | After using a new Bootstrap class. Needs `npm i --no-save purgecss@7` first. |

## Security checklist for the live server

- `NODE_ENV=production`, `PUBLIC_URL=https://your-domain`, a 64-hex `ENCRYPTION_KEY`, correct `TRUST_PROXY`.
- HTTPS only. Turn on **2-step verification** for every admin (Admin -> Account).
- Built in: Content-Security-Policy and other security headers, cross-site request blocking, rate limits on
  sign-in, sign-up, password reset, checkout, coupons, orders, contact form and webhooks, signed Razorpay/Shiprocket
  webhooks, server-side prices, payment amounts checked with Razorpay, admin roles + audit log.

## Pages

- `/` homepage, `/shop`, `/search?q=`, `/product/:slug`, `/cart`, `/checkout`, `/order/:number`
- `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/account`, `/account/orders`, `/account/wishlist`
- `/contact` - contact form (messages arrive in **Admin -> Messages** with a bell notification)
- `/shipping-policy`, `/refund-policy`, `/privacy-policy`, `/terms`; unknown URLs get a real 404
- `/admin` - products, prices, stock, photos, collections, discounts, content, orders, messages, reports

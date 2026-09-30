# Bookends Fanny Pack - Website + Shop

React (Vite) website with an Amazon-style shop and an admin panel, backed by an Express API on PostgreSQL.

## Run it

```bash
npm install
npm run db:migrate   # creates / updates the database tables (safe to re-run)
npm run dev          # starts the API (port 5000) and the website (http://localhost:5173)
```

First time on a new database: `npm run admin:create` makes the first admin (then sign in at `/admin`).

Settings live in `.env` (copy `.env.example` if it is missing):

| Key | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `PORT` | API port (default 5000) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay keys (or add them in Admin -> Integrations). Empty = Cash on Delivery only |
| `ENCRYPTION_KEY` | 64 hex characters; encrypts integration secrets and 2FA keys |
| `PUBLIC_URL` | Public address of the site (email links, sitemap, share tags) |
| `NODE_ENV` | **`production` on the live server** (secure cookies, HTTPS headers, no emails in logs) |
| `SMTP_*` | Email for order updates, password-reset links and admin alerts. Without it, emails are printed in the server console |

## Go live (production)

```bash
npm install
npm run db:migrate
npm run build        # builds the website into dist/
npm start            # with NODE_ENV=production in .env
```

`npm start` serves the API and the built site on one port. Put it behind HTTPS (Nginx, Caddy, or your host's proxy)
and set `TRUST_PROXY=1` when a proxy sits in front. Health check: `GET /api/health`.

Before launch, fill in **Admin -> Settings -> Store -> Business & legal** (registered name, address, GSTIN, FSSAI
licence number, grievance officer). They appear in the footer, Contact page, policies and invoices.

## Backups

```bash
npm run db:backup                                   # backups/db-YYYY-MM-DD-HHMM.json (keeps the newest 30)
npm run db:restore -- backups/db-....json --yes     # replaces ALL data with the backup
```

Schedule `npm run db:backup` daily (Windows Task Scheduler / cron) and copy `backups/` and `uploads/` (admin-uploaded
images) to another disk or cloud storage. If PostgreSQL's `pg_dump` is installed, `pg_dump -Fc` backups are even better.

`npm run db:schema` regenerates `server/migrations/000_base.sql` (the full table structure used for fresh installs)
after tables are changed outside the migration files.

## Pages

- `/` - homepage (content editable in Admin -> Content; collections come from Admin -> Collections)
- `/shop`, `/shop?category=<id>`, `/search?q=` - product listing, filters, sorting, search
- `/product/:slug` - gallery, sizes, price, stock, wishlist, reviews, "notify me when back in stock"
- `/cart`, `/checkout` - coupon codes, saved addresses, PIN-code check, Razorpay or Cash on Delivery
- `/order/:number` - confirmation + tracking timeline, cancel (before shipping), invoice
- `/order/:number/invoice` - printable GST invoice
- `/signin`, `/signup`, `/forgot-password`, `/reset-password` - accounts (no OTP; reset links by email)
- `/account` (profile, password, address book), `/account/orders`, `/account/wishlist`
- `/contact`, `/shipping-policy`, `/refund-policy`, `/privacy-policy`, `/terms`
- Anything else shows a "Page not found" page with a real 404 status. `/robots.txt` and `/sitemap.xml` are generated.

## Customer emails

Sent automatically (when SMTP is set up and Admin -> Settings -> Notifications -> "Email customers" is on):
order confirmed, shipped, out for delivery, delivered, cancelled, refund issued, password reset, back in stock.

## Editing products

Everything is in the admin panel (`/admin`): products, prices, stock, photos, HSN code and GST rate, collections,
discounts, homepage content, reviews, orders, shipping and refunds.

-- Customer accounts, reviews, stock alerts, invoices and data-integrity fixes.
-- Additive and idempotent.

-- ---------- sign-up without codes: every existing account counts as verified ----------
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, now()) WHERE email_verified_at IS NULL;

-- ---------- customer password reset (link sent by email) ----------
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  text PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

-- ---------- address book ----------
CREATE TABLE IF NOT EXISTS customer_addresses (
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phone         text NOT NULL,
  address_line  text NOT NULL,
  city          text NOT NULL,
  state         text NOT NULL,
  pin           text NOT NULL,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses (user_id);

-- ---------- product reviews (only from customers who received the product) ----------
CREATE TABLE IF NOT EXISTS product_reviews (
  id          bigserial PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       text,
  body        text,
  status      text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews (product_id, status, created_at DESC);

-- ---------- "notify me when back in stock" ----------
CREATE TABLE IF NOT EXISTS stock_alerts (
  id           bigserial PRIMARY KEY,
  variant_id   integer NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  email        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_open_idx ON stock_alerts (variant_id, lower(email)) WHERE notified_at IS NULL;

-- ---------- order lines keep the exact variant + tax used (restock, invoices) ----------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hsn text;
UPDATE order_items oi SET variant_id = v.id
FROM product_variants v
WHERE oi.variant_id IS NULL AND v.product_id = oi.product_id AND v.option IS NOT DISTINCT FROM oi.option;

ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn text;

-- ---------- coupons given back when an order is cancelled ----------
ALTER TABLE discount_usages ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- ---------- customer cancellation ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ---------- admin 2FA: remember the last accepted time step (no code replay) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;

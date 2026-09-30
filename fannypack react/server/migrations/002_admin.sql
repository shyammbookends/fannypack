-- Admin panel schema. Additive and idempotent: safe to run many times.
-- Existing tables (users, sessions, products, product_variants, categories, orders,
-- order_items, integrations, settings) are reused and only extended.

-- ============ Admin users & roles ============
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role      text;           -- null = customer
ALTER TABLE users ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins   integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until    timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled    boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at   timestamptz;
UPDATE users SET admin_role = 'super_admin' WHERE is_admin AND admin_role IS NULL;

CREATE TABLE IF NOT EXISTS admin_roles (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_roles (key, name, permissions, is_system) VALUES
  ('super_admin', 'Super Admin', '["*"]', true),
  ('admin', 'Admin', '["dashboard","orders","products","collections","inventory","customers","discounts","content","payments","shipping","analytics","reports","integrations","settings","audit_logs"]', false),
  ('manager', 'Manager', '["dashboard","orders","products","collections","inventory","customers","discounts","shipping","analytics","reports"]', false),
  ('content_manager', 'Content Manager', '["dashboard","products","collections","content"]', false),
  ('order_manager', 'Order Manager', '["dashboard","orders","customers","shipping","inventory"]', false)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash   text PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip           text,
  user_agent   text,
  mfa_passed   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id);

CREATE TABLE IF NOT EXISTS admin_password_resets (
  token_hash text PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  admin_id    bigint REFERENCES users(id) ON DELETE SET NULL,
  admin_email text,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity, entity_id);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  severity   text NOT NULL DEFAULT 'info',   -- info | good | warning | critical
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notifications_created_idx ON admin_notifications (created_at DESC);

-- ============ Collections (the existing "categories" table) ============
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description     text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner          text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_title       text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS featured        boolean NOT NULL DEFAULT false;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS active          boolean NOT NULL DEFAULT true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_mode    text NOT NULL DEFAULT 'list';  -- list | group
ALTER TABLE categories ADD COLUMN IF NOT EXISTS accent          text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon            text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS site_image      text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS variant_label   text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- Seed the website's current look for the four existing collections (only if still empty)
UPDATE categories c SET
  display_mode  = v.mode,
  accent        = COALESCE(c.accent, v.accent),
  icon          = COALESCE(c.icon, v.icon),
  banner        = COALESCE(c.banner, v.banner),
  site_image    = COALESCE(c.site_image, v.site_image),
  variant_label = COALESCE(c.variant_label, v.vlabel),
  featured      = true,
  description   = COALESCE(c.description, c.note)
FROM (VALUES
  ('ghaslate',     'group', '#e8281a', 'fa-pepper-hot',        '/img/products/ghaslet-banner-splash.jpg', NULL, 'Flavours'),
  ('chilli-crisp', 'group', '#f6a623', 'fa-fire-flame-curved', '/img/products/chilli-crisp-banner.jpg', '/img/products/chilli-crisp-label.png', 'Variants'),
  ('lemonde',      'list',  '#ffd60a', 'fa-lemon',             NULL, NULL, NULL),
  ('merchenties',  'list',  '#22d3ee', 'fa-shirt',             NULL, NULL, NULL)
) AS v(id, mode, accent, icon, banner, site_image, vlabel)
WHERE c.id = v.id AND c.accent IS NULL;

-- ============ Products ============
ALTER TABLE products ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'active';  -- draft | active | archived
ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand             text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags              jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_url         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_poster      text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_enabled     boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_settings    jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title         text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description   text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS og_image          text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate          numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();
UPDATE products SET status = 'archived' WHERE NOT active AND status = 'active';
UPDATE products SET brand = 'Bookends Fanny Pack' WHERE brand IS NULL;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sku                 text;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode             text;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS compare_at_price    integer;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_price          integer;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS track_inventory     boolean NOT NULL DEFAULT true;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS weight_g            integer;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS length_cm           numeric(8,2);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS width_cm            numeric(8,2);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS height_cm           numeric(8,2);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS shipping_class      text;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_key ON product_variants (sku) WHERE sku IS NOT NULL AND sku <> '';
UPDATE product_variants
SET sku = upper('FP-' || product_id || CASE WHEN option <> '' THEN '-' || regexp_replace(option, '[^A-Za-z0-9]+', '', 'g') ELSE '' END)
WHERE sku IS NULL;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id          bigserial PRIMARY KEY,
  variant_id  integer REFERENCES product_variants(id) ON DELETE SET NULL,
  product_id  text,
  option      text,
  previous    integer NOT NULL,
  new         integer NOT NULL,
  change      integer NOT NULL,
  reason      text,
  source      text NOT NULL,          -- admin | order | release | cancel | refund
  order_id    bigint REFERENCES orders(id) ON DELETE SET NULL,
  admin_id    bigint REFERENCES users(id) ON DELETE SET NULL,
  admin_email text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_tx_variant_idx ON inventory_transactions (variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_tx_created_idx ON inventory_transactions (created_at DESC);

-- ============ Orders, payments, shipments ============
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount    integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount         integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status    text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_status      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expected_delivery  date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_synced_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_awb_idx ON orders (awb_code) WHERE awb_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_status_history (
  id          bigserial PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      text NOT NULL,
  note        text,
  source      text NOT NULL DEFAULT 'system',   -- system | admin | customer | webhook
  admin_email text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history (order_id, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id                  bigserial PRIMARY KEY,
  order_id            bigint REFERENCES orders(id) ON DELETE SET NULL,
  provider            text NOT NULL DEFAULT 'razorpay',
  provider_payment_id text NOT NULL,
  provider_order_id   text,
  amount              integer NOT NULL,        -- rupees
  currency            text NOT NULL DEFAULT 'INR',
  status              text NOT NULL,           -- captured | authorized | failed | refunded
  method              text,
  error               text,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id);

CREATE TABLE IF NOT EXISTS refunds (
  id                 bigserial PRIMARY KEY,
  order_id           bigint REFERENCES orders(id) ON DELETE SET NULL,
  provider           text NOT NULL DEFAULT 'razorpay',
  provider_refund_id text NOT NULL,
  payment_id         text,
  amount             integer NOT NULL,
  status             text NOT NULL,
  reason             text,
  admin_email        text,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_refund_id)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                bigserial PRIMARY KEY,
  provider          text NOT NULL,             -- razorpay | shiprocket
  event_id          text NOT NULL,
  event_type        text,
  payload           jsonb,
  signature         text,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  processing_status text NOT NULL DEFAULT 'received',  -- received | processed | failed | ignored | rejected
  error_message     text,
  attempts          integer NOT NULL DEFAULT 0,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_events_received_idx ON webhook_events (provider, received_at DESC);
CREATE OR REPLACE VIEW payment_webhook_events AS
  SELECT * FROM webhook_events WHERE provider = 'razorpay';

CREATE TABLE IF NOT EXISTS shipment_events (
  id          bigserial PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      text NOT NULL,
  status_code text,
  location    text,
  description text,
  event_time  timestamptz,
  source      text NOT NULL DEFAULT 'sync',   -- sync | webhook | admin
  raw         jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_dedupe ON shipment_events (order_id, status, COALESCE(event_time, 'epoch'::timestamptz));

-- ============ Discounts ============
CREATE TABLE IF NOT EXISTS discounts (
  id                 bigserial PRIMARY KEY,
  code               text NOT NULL,
  description        text,
  type               text NOT NULL,              -- percent | fixed
  value              integer NOT NULL CHECK (value > 0),
  scope              text NOT NULL DEFAULT 'all', -- all | products | collections
  product_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  collection_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_order          integer NOT NULL DEFAULT 0,
  max_discount       integer,
  starts_at          timestamptz,
  ends_at            timestamptz,
  usage_limit        integer,
  per_customer_limit integer,
  used_count         integer NOT NULL DEFAULT 0,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discounts_code_key ON discounts (upper(code));

CREATE TABLE IF NOT EXISTS discount_usages (
  id          bigserial PRIMARY KEY,
  discount_id bigint NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  order_id    bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     bigint REFERENCES users(id) ON DELETE SET NULL,
  amount      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_id, order_id)
);

-- Website order of collections (kept separate from "sort", which another app may use)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS site_sort integer;
UPDATE categories c SET site_sort = v.s
FROM (VALUES ('ghaslate', 0), ('chilli-crisp', 1), ('lemonde', 2), ('merchenties', 3)) AS v(id, s)
WHERE c.id = v.id AND c.site_sort IS NULL;
UPDATE categories SET site_sort = 100 + sort WHERE site_sort IS NULL;

-- Additive changes for the website on top of the existing "fannypack" schema.
-- Safe to run many times: only adds columns and fills them when they are still empty.
-- Nothing is dropped and existing columns (name, image, ...) are left untouched,
-- so any other app using this database keeps working.

ALTER TABLE products   ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS site_images  jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS ingredients  jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_name text;

-- Names as they appear on the website
UPDATE categories SET display_name = v.name
FROM (VALUES
  ('ghaslate',     'Ghaslet'),
  ('chilli-crisp', 'Chilli Crisp'),
  ('lemonde',      'DK''s Boom Boom Lemonde'),
  ('merchenties',  'Merchandise')
) AS v(id, name)
WHERE categories.id = v.id AND categories.display_name IS NULL;

UPDATE products SET display_name = v.name
FROM (VALUES
  ('the-classic',    'Ghaslet The Classic'),
  ('tamarind-blaze', 'Ghaslet Tamarind Blaze'),
  ('tingle-berry',   'Ghaslet Tingle Berry'),
  ('gates-of-hell',  'Ghaslet Gates of Hell'),
  ('truffle-bomb',   'Ghaslet Truffle Bomb'),
  ('jain',           'Chilli Crisp - Jain'),
  ('non-jain',       'Chilli Crisp - Non-Jain'),
  ('lemonde',        'DK''s Boom Boom Lemonde'),
  ('tshirt',         'Friends of Capiche T-Shirt'),
  ('jacket',         'Capiche Jacket'),
  ('pendent',        'Capiche Pendant')
) AS v(id, name)
WHERE products.id = v.id AND products.display_name IS NULL;

-- Website image paths (files live in sarab-react/public/img/products)
UPDATE products SET site_images = v.imgs::jsonb
FROM (VALUES
  ('the-classic',    '["/img/products/ghaslet-classic-poster.jpg","/img/products/ghaslet-classic.png"]'),
  ('tamarind-blaze', '["/img/products/ghaslet-tamarind-blaze-poster.jpg","/img/products/ghaslet-tamarind-blaze.png"]'),
  ('tingle-berry',   '["/img/products/ghaslet-tingle-berry-poster.jpg","/img/products/ghaslet-tingle-berry.png"]'),
  ('gates-of-hell',  '["/img/products/ghaslet-gates-of-hell-poster.jpg","/img/products/ghaslet-gates-of-hell.png"]'),
  ('truffle-bomb',   '["/img/products/ghaslet-truffle-bomb-poster.jpg","/img/products/ghaslet-truffle-bomb.png"]'),
  ('jain',           '["/img/products/chilli-crisp-label.png","/img/products/chilli-crisp-front.png","/img/products/chilli-crisp-top.png"]'),
  ('non-jain',       '["/img/products/chilli-crisp-label.png","/img/products/chilli-crisp-front.png","/img/products/chilli-crisp-top.png"]')
) AS v(id, imgs)
WHERE products.id = v.id AND products.site_images = '[]'::jsonb;

-- Accounts: sign in with email OR mobile number
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

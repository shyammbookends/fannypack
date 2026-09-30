-- Each size / option can have its own photo (e.g. 30 ml vs 180 ml bottle).
-- Choosing that option on the product page shows its photo first.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image text;

-- Ghaslet: 30 ml bottle photos; 180 ml keeps the existing poster
UPDATE product_variants v SET image = x.img
FROM (VALUES
  ('the-classic',    '30 ml',  '/img/products/ghaslet-classic-30ml.jpg'),
  ('tamarind-blaze', '30 ml',  '/img/products/ghaslet-tamarind-blaze-30ml.jpg'),
  ('tingle-berry',   '30 ml',  '/img/products/ghaslet-tingle-berry-30ml.jpg'),
  ('gates-of-hell',  '30 ml',  '/img/products/ghaslet-gates-of-hell-30ml.jpg'),
  ('truffle-bomb',   '30 ml',  '/img/products/ghaslet-truffle-bomb-30ml.jpg'),
  ('the-classic',    '180 ml', '/img/products/ghaslet-classic-poster.jpg'),
  ('tamarind-blaze', '180 ml', '/img/products/ghaslet-tamarind-blaze-poster.jpg'),
  ('tingle-berry',   '180 ml', '/img/products/ghaslet-tingle-berry-poster.jpg'),
  ('gates-of-hell',  '180 ml', '/img/products/ghaslet-gates-of-hell-poster.jpg'),
  ('truffle-bomb',   '180 ml', '/img/products/ghaslet-truffle-bomb-poster.jpg')
) AS x(product_id, option, img)
WHERE v.product_id = x.product_id AND v.option = x.option AND v.image IS NULL;

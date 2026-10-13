-- Friends of Capiche T-Shirt: replace the yellow photos with the cream ones (front first, back second).
-- Only replaces them while they are still the old yellow photos, so admin edits are kept.
UPDATE products
SET site_images = '["/img/products/capiche-tshirt-cream-front.jpg", "/img/products/capiche-tshirt-cream-back.jpg"]'::jsonb,
    image = '/img/products/capiche-tshirt-cream-front.jpg',
    updated_at = now()
WHERE id = 'tshirt'
  AND site_images = '["/img/products/capiche-tshirt-front.jpg", "/img/products/capiche-tshirt-back.jpg"]'::jsonb;

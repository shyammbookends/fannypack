-- Capiche Jacket photos (front first, back second).
-- Only filled in while the product has no photos, so admin edits are never overwritten.
UPDATE products
SET site_images = '["/img/products/capiche-jacket-front.jpg", "/img/products/capiche-jacket-back.jpg"]'::jsonb,
    image = '/img/products/capiche-jacket-front.jpg',
    updated_at = now()
WHERE id = 'jacket' AND COALESCE(jsonb_array_length(site_images), 0) = 0;

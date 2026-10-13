-- Friends of Capiche T-Shirt photos (front first, back second).
-- Only filled in while the product has no photos, so admin edits are never overwritten.
UPDATE products
SET site_images = '["/img/products/capiche-tshirt-front.jpg", "/img/products/capiche-tshirt-back.jpg"]'::jsonb,
    image = '/img/products/capiche-tshirt-front.jpg',
    updated_at = now()
WHERE id = 'tshirt' AND COALESCE(jsonb_array_length(site_images), 0) = 0;

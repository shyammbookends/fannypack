-- Capiche Pendant photos (red enamel + diamonds first, plain silver second).
-- Only fills them in while the product has no photos, so admin edits are never overwritten.
UPDATE products
SET site_images = '["/img/products/capiche-pendant-red.jpg", "/img/products/capiche-pendant-silver.jpg"]'::jsonb,
    image = '/img/products/capiche-pendant-red.jpg',
    updated_at = now()
WHERE id = 'pendent' AND COALESCE(jsonb_array_length(site_images), 0) = 0;

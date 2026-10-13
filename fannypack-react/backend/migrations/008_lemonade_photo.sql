-- DK's Boom Boom Lemonde photo for the product and its collection card.
-- Only filled in while empty, so admin edits are never overwritten.
UPDATE products
SET site_images = '["/img/products/dks-boom-boom-lemonade.jpg"]'::jsonb,
    image = '/img/products/dks-boom-boom-lemonade.jpg',
    updated_at = now()
WHERE id = 'lemonde' AND COALESCE(jsonb_array_length(site_images), 0) = 0;

UPDATE categories
SET site_image = '/img/products/dks-boom-boom-lemonade.jpg'
WHERE id = 'lemonde' AND site_image IS NULL;

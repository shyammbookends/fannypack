-- Ghaslet collection card: circle photo of the five sauces (replaces the chilli icon).
-- Only filled in while empty, so admin edits are never overwritten.
UPDATE categories
SET site_image = '/img/products/ghaslet-collection-circle.jpg'
WHERE id = 'ghaslate' AND site_image IS NULL;

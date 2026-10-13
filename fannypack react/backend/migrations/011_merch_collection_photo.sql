-- Merchandise collection card: circle photo of the T-shirt, jacket and pendant.
-- Only filled in while empty, so admin edits are never overwritten.
UPDATE categories
SET site_image = '/img/products/capiche-merch-circle.jpg'
WHERE id = 'merchenties' AND site_image IS NULL;

-- Merchandise collection card: switch to the cream T-shirt circle photo.
-- Only replaces it while it is still the old yellow circle, so admin edits are kept.
UPDATE categories
SET site_image = '/img/products/capiche-merch-circle-cream.jpg'
WHERE id = 'merchenties' AND site_image = '/img/products/capiche-merch-circle.jpg';

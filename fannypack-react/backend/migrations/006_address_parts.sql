-- Addresses in separate parts (house no., building, street, area, landmark).
-- address_line keeps the joined full address for couriers, invoices and emails.
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS house text;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS building text;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS landmark text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS house text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS building text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS landmark text;

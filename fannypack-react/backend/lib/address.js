// Address parts shared by checkout and the address book.
// House no. and area are required; building, street and landmark are optional.
export const ADDRESS_PARTS = ['house', 'building', 'street', 'area', 'landmark'];

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// { house, building, street, area, landmark } -> cleaned parts + joined address_line, or field errors.
// Older callers that only send address_line (one box) are still accepted.
export function addressFromParts(a = {}) {
  const parts = {
    house: clean(a.house, 60),
    building: clean(a.building, 100),
    street: clean(a.street, 120),
    area: clean(a.area, 120),
    landmark: clean(a.landmark, 120),
  };
  const errors = {};
  // the new form always sends the part fields (even when empty); only old callers send address_line alone
  const hasParts = ADDRESS_PARTS.some((k) => a[k] !== undefined && a[k] !== null);
  if (!hasParts) {
    const line = clean(a.address_line, 250);
    if (line.length < 5) errors.house = 'Enter your house / flat number.';
    return { parts: { house: null, building: null, street: null, area: null, landmark: null }, address_line: line, errors };
  }
  if (!parts.house) errors.house = 'Enter your house / flat number.';
  if (parts.area.length < 2) errors.area = 'Enter your area / locality.';
  const address_line = [
    parts.house, parts.building, parts.street, parts.area,
    parts.landmark && `Landmark: ${parts.landmark}`,
  ].filter(Boolean).join(', ');
  if (address_line.length > 250) errors.street = 'The address is too long. Please shorten it.';
  return {
    parts: Object.fromEntries(ADDRESS_PARTS.map((k) => [k, parts[k] || null])),
    address_line,
    errors,
  };
}

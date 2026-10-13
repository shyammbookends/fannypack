// Indian states and union territories with their GST state codes.
export const STATES = [
  ['Andaman and Nicobar Islands', '35'], ['Andhra Pradesh', '37'], ['Arunachal Pradesh', '12'], ['Assam', '18'],
  ['Bihar', '10'], ['Chandigarh', '04'], ['Chhattisgarh', '22'], ['Dadra and Nagar Haveli and Daman and Diu', '26'],
  ['Delhi', '07'], ['Goa', '30'], ['Gujarat', '24'], ['Haryana', '06'], ['Himachal Pradesh', '02'],
  ['Jammu and Kashmir', '01'], ['Jharkhand', '20'], ['Karnataka', '29'], ['Kerala', '32'], ['Ladakh', '38'],
  ['Lakshadweep', '31'], ['Madhya Pradesh', '23'], ['Maharashtra', '27'], ['Manipur', '14'], ['Meghalaya', '17'],
  ['Mizoram', '15'], ['Nagaland', '13'], ['Odisha', '21'], ['Puducherry', '34'], ['Punjab', '03'],
  ['Rajasthan', '08'], ['Sikkim', '11'], ['Tamil Nadu', '33'], ['Telangana', '36'], ['Tripura', '16'],
  ['Uttar Pradesh', '09'], ['Uttarakhand', '05'], ['West Bengal', '19'],
];

export const STATE_NAMES = STATES.map(([n]) => n);

const byLower = new Map(STATES.map(([n, c]) => [n.toLowerCase(), { name: n, code: c }]));
// common spellings people type
const ALIASES = { gujrat: 'gujarat', gj: 'gujarat', 'new delhi': 'delhi', nct: 'delhi', orissa: 'odisha', pondicherry: 'puducherry', mh: 'maharashtra', up: 'uttar pradesh', mp: 'madhya pradesh', 'j&k': 'jammu and kashmir' };

// "gujrat " -> "Gujarat" (null when unknown)
export function normalizeState(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return byLower.get(ALIASES[k] || k)?.name || null;
}

export const stateCode = (name) => byLower.get(String(name || '').toLowerCase())?.code || null;

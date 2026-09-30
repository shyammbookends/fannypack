import { useEffect } from 'react';
import { useSite } from './SiteContext.jsx';

// Delivery address fields (checkout + address book). State is a dropdown of the
// states we deliver to, so it always matches what the server expects.
export const EMPTY_ADDRESS = { name: '', phone: '', address_line: '', city: '', state: '', pin: '' };

export default function AddressFields({ value, onChange, errors = {}, onPinBlur, withEmail = false, idPrefix = 'ad' }) {
  const { config } = useSite();
  const states = config?.states?.length ? config.states : [];
  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === 'pin') v = v.replace(/\D/g, '').slice(0, 6);
    if (k === 'phone') v = v.replace(/[^\d+ ]/g, '').slice(0, 14);
    onChange({ ...value, [k]: v }, k);
  };
  // a single allowed state is picked automatically
  const only = states.length === 1 ? states[0] : null;
  const stateValue = only || value.state || '';
  useEffect(() => {
    if (only && value.state !== only) onChange({ ...value, state: only }, null); // automatic, not a user edit
  }, [only, value, onChange]);

  const input = (k, label, props = {}, col = 'col-12') => (
    <div className={col}>
      <label className="co-label" htmlFor={`${idPrefix}-${k}`}>{label}</label>
      <input
        id={`${idPrefix}-${k}`}
        className={'co-input' + (errors[k] ? ' invalid' : '')}
        value={value[k] ?? ''}
        onChange={set(k)}
        aria-invalid={Boolean(errors[k])}
        {...props}
      />
      {errors[k] && <div className="co-err">{errors[k]}</div>}
    </div>
  );

  return (
    <div className="row g-3">
      {input('name', 'Full name', { autoComplete: 'name' })}
      {input('phone', 'Mobile number', { autoComplete: 'tel', inputMode: 'numeric', placeholder: '10-digit mobile number' }, withEmail ? 'col-sm-6' : 'col-12')}
      {withEmail && input('email', 'Email (for order updates)', { autoComplete: 'email', type: 'email' }, 'col-sm-6')}
      {input('address_line', 'Address (house no., building, street, area)', { autoComplete: 'street-address' })}
      {input('city', 'City', { autoComplete: 'address-level2' }, 'col-sm-4')}
      <div className="col-sm-4">
        <label className="co-label" htmlFor={`${idPrefix}-state`}>State</label>
        <select
          id={`${idPrefix}-state`}
          className={'co-input' + (errors.state ? ' invalid' : '')}
          value={stateValue}
          onChange={set('state')}
          autoComplete="address-level1"
          disabled={states.length === 1}
        >
          {states.length !== 1 && <option value="">Choose…</option>}
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {errors.state && <div className="co-err">{errors.state}</div>}
      </div>
      {input('pin', 'PIN code', { autoComplete: 'postal-code', inputMode: 'numeric', onBlur: onPinBlur }, 'col-sm-4')}
    </div>
  );
}

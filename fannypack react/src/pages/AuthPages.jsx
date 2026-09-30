import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../shop/AuthContext.jsx';
import { useSite } from '../shop/SiteContext.jsx';
import { api } from '../shop/api.js';
import { useSeo } from '../shop/useSeo.js';

const MIN_PASSWORD = 8;

// Only allow in-site redirects after sign in
const safeNext = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');

function AuthShell({ title, children, footer }) {
  const { store } = useSite();
  return (
    <main className="auth-page">
      <Link to="/" className="auth-logo"><img src={store.logo || '/img/logo.png'} alt={store.name} /></Link>
      <div className="auth-card">
        <h1>{title}</h1>
        {children}
      </div>
      {footer}
    </main>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-pw">
      <input
        id={id}
        className={'auth-input' + (invalid ? ' invalid' : '')}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button type="button" className="auth-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <i className={'fas ' + (show ? 'fa-eye-slash' : 'fa-eye')}></i>
      </button>
    </div>
  );
}

const Err = ({ children }) => (children ? <div className="auth-err"><i className="fas fa-circle-exclamation"></i>{children}</div> : null);

function Legal({ action }) {
  return (
    <p className="auth-legal">
      By {action}, you agree to our <Link to="/terms">Terms &amp; Conditions</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.
    </p>
  );
}

// ---------- Sign in: email or mobile number + password ----------
export function SignInPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useSeo('Sign in', { noindex: true });

  if (ready && user) return <Navigate to={next} replace />;

  const onSignIn = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) return setError('Enter your email or mobile number.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      footer={
        <div className="auth-new">
          <div className="auth-divider"><span>New to Bookends Fanny Pack?</span></div>
          <Link to={`/signup?next=${encodeURIComponent(next)}`} className="auth-btn auth-btn-light">Create your account</Link>
        </div>
      }
    >
      {next.startsWith('/checkout') && (
        <p className="auth-note"><i className="fas fa-lock"></i> Sign in to continue to checkout. Your cart is saved.</p>
      )}
      {error && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation"></i>{error}</div>}
      <form onSubmit={onSignIn} noValidate>
        <label className="auth-label" htmlFor="auth-id">Email or mobile number</label>
        <input
          id="auth-id"
          className="auth-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
        />
        <div className="auth-label-row">
          <label className="auth-label" htmlFor="auth-pw">Password</label>
          <Link to={`/forgot-password${identifier.includes('@') ? `?email=${encodeURIComponent(identifier.trim())}` : ''}`} className="auth-forgot">Forgot password?</Link>
        </div>
        <PasswordInput id="auth-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button className="auth-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <Legal action="continuing" />
    </AuthShell>
  );
}

// ---------- Create account (signs you in straight away) ----------
export function SignUpPage() {
  const { user, ready, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useSeo('Create account', { noindex: true });

  if (ready && user) return <Navigate to={next} replace />;

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFields((f) => ({ ...f, [k]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const local = {};
    if (form.name.trim().length < 2) local.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S{2,}$/.test(form.email.trim())) local.email = 'Enter a valid email address.';
    if (form.phone.replace(/\D/g, '').length < 10) local.phone = 'Enter your 10-digit mobile number.';
    if (form.password.length < MIN_PASSWORD) local.password = `Passwords must be at least ${MIN_PASSWORD} characters.`;
    if (form.password !== form.confirm) local.confirm = 'Passwords do not match.';
    if (Object.keys(local).length) return setFields(local);
    setBusy(true);
    try {
      await signup({ name: form.name, phone: form.phone, email: form.email, password: form.password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setFields(err.data?.fields || {});
      setBusy(false);
    }
  };

  const field = (k, label, props = {}) => (
    <>
      <label className="auth-label" htmlFor={`su-${k}`}>{label}</label>
      <input id={`su-${k}`} className={'auth-input' + (fields[k] ? ' invalid' : '')} value={form[k]} onChange={set(k)} {...props} />
      <Err>{fields[k]}</Err>
    </>
  );

  return (
    <AuthShell
      title="Create account"
      footer={
        <p className="auth-switch">
          Already have an account? <Link to={`/signin?next=${encodeURIComponent(next)}`}>Sign in <i className="fas fa-caret-right"></i></Link>
        </p>
      }
    >
      {error && !Object.values(fields).some(Boolean) && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation"></i>{error}</div>}
      <form onSubmit={onSubmit} noValidate>
        {field('name', 'Your name', { autoComplete: 'name', placeholder: 'First and last name', autoFocus: true })}
        {field('phone', 'Mobile number', { autoComplete: 'tel', inputMode: 'numeric', placeholder: '10-digit mobile number' })}
        {field('email', 'Email', { autoComplete: 'email', type: 'email' })}
        <label className="auth-label" htmlFor="su-password">Password</label>
        <PasswordInput id="su-password" value={form.password} onChange={set('password')} autoComplete="new-password" invalid={fields.password} placeholder={`At least ${MIN_PASSWORD} characters`} />
        {fields.password ? <Err>{fields.password}</Err> : <div className="auth-hint"><i className="fas fa-circle-info"></i>Passwords must be at least {MIN_PASSWORD} characters.</div>}
        <label className="auth-label" htmlFor="su-confirm">Re-enter password</label>
        <PasswordInput id="su-confirm" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" invalid={fields.confirm} />
        <Err>{fields.confirm}</Err>
        <button className="auth-btn" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <Legal action="creating an account" />
    </AuthShell>
  );
}

// ---------- Forgot password: email a reset link ----------
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useSeo('Forgot password', { noindex: true });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S{2,}$/.test(email.trim())) return setError('Enter the email address of your account.');
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" footer={<p className="auth-switch"><Link to="/signin"><i className="fas fa-arrow-left"></i> Back to sign in</Link></p>}>
      {sent ? (
        <div className="auth-ok" role="status">
          <i className="fas fa-circle-check"></i>
          If <strong>{email.trim()}</strong> has an account, we have emailed a link to reset the password. It is valid for 1 hour — check your Spam or Promotions folder too.
        </div>
      ) : (
        <>
          <p className="auth-note"><i className="fas fa-envelope"></i> Enter your account email and we'll send you a link to choose a new password.</p>
          {error && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation"></i>{error}</div>}
          <form onSubmit={submit} noValidate>
            <label className="auth-label" htmlFor="fp-email">Email</label>
            <input id="fp-email" className="auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <button className="auth-btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

// ---------- Reset password (link from the email) ----------
export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useSeo('Reset password', { noindex: true });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const local = {};
    if (password.length < MIN_PASSWORD) local.password = `Passwords must be at least ${MIN_PASSWORD} characters.`;
    if (password !== confirm) local.confirm = 'Passwords do not match.';
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/account', { replace: true, state: { notice: 'Your password has been changed.' } });
    } catch (err) {
      setError(err.message);
      setFields(err.data?.fields || {});
      setBusy(false);
    }
  };

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <AuthShell title="Reset password">
        <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation"></i>This reset link is not valid.</div>
        <Link to="/forgot-password" className="auth-btn">Ask for a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      {error && !Object.values(fields).some(Boolean) && (
        <div className="auth-alert" role="alert">
          <i className="fas fa-triangle-exclamation"></i>{error} <Link to="/forgot-password">Get a new link</Link>
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <label className="auth-label" htmlFor="rp-pw">New password</label>
        <PasswordInput id="rp-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" invalid={fields.password} placeholder={`At least ${MIN_PASSWORD} characters`} />
        <Err>{fields.password}</Err>
        <label className="auth-label" htmlFor="rp-confirm">Re-enter new password</label>
        <PasswordInput id="rp-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" invalid={fields.confirm} />
        <Err>{fields.confirm}</Err>
        <button className="auth-btn" disabled={busy}>{busy ? 'Saving…' : 'Save password and sign in'}</button>
      </form>
    </AuthShell>
  );
}

// ---------- Guard: pages that need a signed-in user (checkout, account) ----------
export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <main className="shop-page container">
        <div className="shop-loading"><span className="shop-spinner"></span>Loading…</div>
      </main>
    );
  }
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../api.js';
import { useAdmin } from '../AdminApp.jsx';
import { Btn, Field, Input } from '../ui.jsx';

const safeNext = (v) => (v && v.startsWith('/admin') && !v.startsWith('//') ? v : '/admin');

function Shell({ children }) {
  return (
    <div className="adm-login">
      <div className="adm-login-card">
        <div className="adm-login-brand">
          <img src="/img/logo.png" alt="" />
          <div>
            <strong>FANNYPACK</strong>
            <span>Admin panel</span>
          </div>
        </div>
        {children}
        <p className="adm-login-foot"><i className="fas fa-lock" /> Secure area. All sign-ins are logged.</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { admin, mfaRequired, refresh } = useAdmin();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState(params.get('mfa') ? 'mfa' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in | FANNYPACK Admin';
  }, []);
  useEffect(() => {
    if (mfaRequired) setStep('mfa');
  }, [mfaRequired]);

  if (admin) return <Navigate to={next} replace />;

  const login = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await post('/auth/login', { email, password, remember });
      if (r.mfaRequired) setStep('mfa');
      else {
        await refresh();
        navigate(next, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const mfa = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post('/auth/mfa', { code });
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {step === 'login' ? (
        <form onSubmit={login} className="adm-stack" style={{ gap: 12 }}>
          <h1>Sign in</h1>
          {error && <div className="adm-alert critical"><i className="fas fa-circle-exclamation" /><div>{error}</div></div>}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <label className="adm-row" style={{ gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in for 30 days
          </label>
          <button className="adm-btn primary" disabled={busy || !email || !password}>{busy ? <span className="adm-spin sm" /> : null}<span>Sign in</span></button>
          <div className="adm-login-links">
            <Link to="/admin/forgot">Forgot password?</Link>
            <a href="/">Back to store</a>
          </div>
        </form>
      ) : (
        <form onSubmit={mfa} className="adm-stack" style={{ gap: 12 }}>
          <h1>Two-step verification</h1>
          <p className="adm-muted">Enter the 6-digit code from your authenticator app.</p>
          {error && <div className="adm-alert critical"><i className="fas fa-circle-exclamation" /><div>{error}</div></div>}
          <Field label="Code">
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
          </Field>
          <button className="adm-btn primary" disabled={busy || code.length !== 6}>{busy ? <span className="adm-spin sm" /> : null}<span>Verify</span></button>
          <div className="adm-login-links">
            <a onClick={async () => { await post('/auth/logout').catch(() => {}); setStep('login'); setCode(''); }}>Use a different account</a>
          </div>
        </form>
      )}
    </Shell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1>Reset password</h1>
      {sent ? (
        <div className="adm-alert good"><i className="fas fa-envelope" /><div>If that email belongs to an admin, a reset link is on its way. It is valid for 1 hour.</div></div>
      ) : (
        <form onSubmit={submit} className="adm-stack" style={{ gap: 12 }}>
          <p className="adm-muted">Enter your admin email and we will send you a reset link.</p>
          {error && <div className="adm-alert critical"><i className="fas fa-circle-exclamation" /><div>{error}</div></div>}
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <button className="adm-btn primary" disabled={busy || !email}>{busy ? <span className="adm-spin sm" /> : null}<span>Send reset link</span></button>
        </form>
      )}
      <div className="adm-login-links"><Link to="/admin/login">Back to sign in</Link></div>
    </Shell>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 10) return setError('Use at least 10 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await post('/auth/reset', { token, password: pw });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1>Choose a new password</h1>
      {done ? (
        <div className="adm-alert good"><i className="fas fa-circle-check" /><div>Password changed. You can sign in now.</div></div>
      ) : (
        <form onSubmit={submit} className="adm-stack" style={{ gap: 12 }}>
          {!token && <div className="adm-alert critical"><i className="fas fa-circle-exclamation" /><div>This link is missing its token. Use the link from the email.</div></div>}
          {error && <div className="adm-alert critical"><i className="fas fa-circle-exclamation" /><div>{error}</div></div>}
          <Field label="New password" hint="At least 10 characters."><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Repeat password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          <button className="adm-btn primary" disabled={busy || !token}>{busy ? <span className="adm-spin sm" /> : null}<span>Save password</span></button>
        </form>
      )}
      <div className="adm-login-links"><Link to="/admin/login">Back to sign in</Link></div>
    </Shell>
  );
}

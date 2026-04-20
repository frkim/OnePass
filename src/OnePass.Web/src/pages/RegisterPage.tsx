import { useState, FormEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { useAuth } from '../auth';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'too_short' | 'error';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const checkSeqRef = useRef(0);

  // Debounced live check: as the user types, ask the server if the
  // username is still available so we can fail fast before submit.
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    if (trimmed.length < 3) {
      setUsernameStatus('too_short');
      return;
    }
    setUsernameStatus('checking');
    const seq = ++checkSeqRef.current;
    const handle = window.setTimeout(async () => {
      try {
        const r = await api.checkUsername(trimmed);
        if (seq !== checkSeqRef.current) return; // stale response
        if (r.reason === 'too_short') setUsernameStatus('too_short');
        else setUsernameStatus(r.available ? 'available' : 'taken');
      } catch {
        if (seq !== checkSeqRef.current) return;
        setUsernameStatus('error');
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [username]);

  const passwordsMatch = password.length === 0 || password === confirmPassword;
  const canSubmit =
    !busy &&
    passwordsMatch &&
    confirmPassword.length > 0 &&
    password.length >= 8 &&
    (usernameStatus === 'available' || usernameStatus === 'idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordsMatch) {
      setError(t('register.passwordMismatch'));
      return;
    }
    if (usernameStatus === 'taken') {
      setError(t('register.usernameTaken'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.register(email, username, password);
      setToken(r.token);
      // Re-login to refresh auth context
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.error'));
    } finally {
      setBusy(false);
    }
  }

  function renderUsernameHint() {
    switch (usernameStatus) {
      case 'checking':
        return <div className="field-hint">{t('register.usernameChecking')}</div>;
      case 'available':
        return <div className="field-hint success">{t('register.usernameAvailable')}</div>;
      case 'taken':
        return <div className="field-hint error">{t('register.usernameTaken')}</div>;
      case 'too_short':
        return <div className="field-hint">{t('register.usernameTooShort')}</div>;
      case 'error':
        return <div className="field-hint error">{t('register.usernameCheckFailed')}</div>;
      default:
        return null;
    }
  }

  const toggleLabel = showPassword ? t('login.hidePassword') : t('login.showPassword');
  const eyeIcon = showPassword ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

  return (
    <div className="login-wrapper">
      <form className="card login-card" onSubmit={onSubmit} aria-label={t('register.title')}>
        <h2>{t('register.title')}</h2>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="email">{t('register.email')}</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="username">{t('register.username')}</label>
          <input
            id="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
            aria-invalid={usernameStatus === 'taken' || usernameStatus === 'too_short'}
            aria-describedby="username-hint"
          />
          <div id="username-hint">{renderUsernameHint()}</div>
        </div>
        <div className="field">
          <label htmlFor="pwd">{t('register.password')}</label>
          <span className="password-input">
            <input
              id="pwd"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(s => !s)}
              aria-label={toggleLabel}
              aria-pressed={showPassword}
              title={toggleLabel}
            >
              {eyeIcon}
            </button>
          </span>
        </div>
        <div className="field">
          <label htmlFor="pwd2">{t('register.confirmPassword')}</label>
          <span className="password-input">
            <input
              id="pwd2"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={!passwordsMatch}
              aria-describedby="pwd2-hint"
            />
          </span>
          <div id="pwd2-hint">
            {!passwordsMatch && (
              <div className="field-hint error">{t('register.passwordMismatch')}</div>
            )}
          </div>
        </div>
        <button type="submit" disabled={!canSubmit} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('register.submit')}
        </button>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('register.hasAccount')} <Link to="/login">{t('register.login')}</Link>
        </p>
      </form>
    </div>
  );
}

import { useState, FormEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { LanguageSelect } from '../LanguageSelect';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; microsoft: boolean } | null>(null);

  useEffect(() => {
    // Best-effort: hide the social buttons in dev environments where the
    // OAuth client has not been configured yet. Failure here is non-fatal —
    // the password form keeps working.
    api.getProviders().then(setProviders).catch(() => setProviders({ google: false, microsoft: false }));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(emailOrUsername, password, remember);
      navigate('/');
    } catch {
      setError(t('login.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrapper">
      <form className="card login-card" onSubmit={onSubmit} aria-label={t('login.title')}>
        <div className="login-header">
          <img src="/favicon.svg" alt="" className="login-logo" />
          <h2>{t('login.title')}</h2>
          <div style={{ flex: 1 }} />
          <LanguageSelect />
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="u">{t('login.emailOrUsername')}</label>
          <input
            id="u"
            value={emailOrUsername}
            onChange={e => setUser(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="p">{t('login.password')}</label>
          <input id="p" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.5rem', cursor: 'pointer', width: '100%' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span>{t('login.stayConnected')}</span>
          </label>
        </div>
        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        {providers?.google && (
          <>
            <div className="login-divider"><span>{t('login.orContinueWith')}</span></div>
            {/* Full-page navigation is required: the Google handler relies
                on a server-set correlation cookie and the browser must
                follow the 302 to accounts.google.com. In dev we navigate
                straight to the API origin (:5248) so the correlation
                cookie and the Google callback share the same origin —
                otherwise the Vite proxy (:5173) would scope the cookie to
                the wrong host and Google would come back with "oauth
                state was missing or invalid". */}
            <a
              className="btn-google"
              href={`${import.meta.env.DEV ? 'http://localhost:5248' : ''}/api/auth/google?returnUrl=/`}
              role="button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.34z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              <span>{t('login.continueWithGoogle')}</span>
            </a>
          </>
        )}
        {providers?.microsoft && (
          <>
            {!providers.google && (
              <div className="login-divider"><span>{t('login.orContinueWith')}</span></div>
            )}
            {/* Same dev-origin trick as Google: hit the API directly so the
                MicrosoftAccount handler's correlation cookie is scoped to
                :5248 (the callback host) rather than the Vite dev proxy. */}
            <a
              className="btn-microsoft"
              href={`${import.meta.env.DEV ? 'http://localhost:5248' : ''}/api/auth/microsoft?returnUrl=/`}
              role="button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
                <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
                <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
                <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
              </svg>
              <span>{t('login.continueWithMicrosoft')}</span>
            </a>
          </>
        )}
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('login.noAccount')} <Link to="/register">{t('login.register')}</Link>
        </p>
        </form>
    </div>
  );
}

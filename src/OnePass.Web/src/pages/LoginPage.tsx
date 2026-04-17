import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <h2>{t('login.title')}</h2>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="u">{t('login.emailOrUsername')}</label>
          <input id="u" value={emailOrUsername} onChange={e => setUser(e.target.value)} required autoFocus autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="p">{t('login.password')}</label>
          <input id="p" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
            />
            {t('login.stayConnected')}
          </label>
        </div>
        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('login.noAccount')} <Link to="/register">{t('login.register')}</Link>
        </p>
      </form>
    </div>
  );
}

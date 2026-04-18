import { useState, FormEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernames, setUsernames] = useState<string[]>([]);

  useEffect(() => {
    api.usernames().then(setUsernames).catch(() => setUsernames([]));
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
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="u">{t('login.emailOrUsername')}</label>
          <input
            id="u"
            list="login-usernames"
            value={emailOrUsername}
            onChange={e => setUser(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
          <datalist id="login-usernames">
            {usernames.map(u => <option key={u} value={u} />)}
          </datalist>
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
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('login.noAccount')} <Link to="/register">{t('login.register')}</Link>
        </p>
        </form>
    </div>
  );
}

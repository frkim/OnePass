import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { useAuth } from '../auth';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
          <input id="username" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="pwd">{t('register.password')}</label>
          <input id="pwd" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('register.submit')}
        </button>
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('register.hasAccount')} <Link to="/login">{t('register.login')}</Link>
        </p>
      </form>
    </div>
  );
}

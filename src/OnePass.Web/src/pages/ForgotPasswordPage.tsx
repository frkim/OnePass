import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { LanguageSelect } from '../LanguageSelect';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch {
      setError(t('forgotPassword.error', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrapper">
      <form className="card login-card" onSubmit={onSubmit} aria-label={t('forgotPassword.title')}>
        <div className="login-header">
          <img src="/favicon.svg" alt="" className="login-logo" />
          <h2>{t('forgotPassword.title', 'Forgot password')}</h2>
          <div style={{ flex: 1 }} />
          <LanguageSelect />
        </div>

        {sent ? (
          <div className="alert success" role="status">
            {t('forgotPassword.sent', 'If this email is registered, a reset link has been sent. Check your inbox (or the API console in dev mode).')}
          </div>
        ) : (
          <>
            <p style={{ margin: '0.5rem 0 1rem' }}>
              {t('forgotPassword.description', 'Enter your email address and we\'ll send you a link to reset your password.')}
            </p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="email">{t('forgotPassword.email', 'Email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? t('common.loading') : t('forgotPassword.submit', 'Send reset link')}
            </button>
          </>
        )}

        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/login">{t('forgotPassword.backToLogin', 'Back to sign in')}</Link>
        </p>
      </form>
    </div>
  );
}

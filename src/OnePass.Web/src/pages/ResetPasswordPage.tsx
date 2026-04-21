import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { LanguageSelect } from '../LanguageSelect';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordsMatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('resetPassword.error', 'Reset failed. The link may have expired.'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="login-wrapper">
        <div className="card login-card">
          <div className="login-header">
            <img src="/favicon.svg" alt="" className="login-logo" />
            <h2>{t('resetPassword.title', 'Reset password')}</h2>
          </div>
          <div className="alert error" role="alert">
            {t('resetPassword.missingToken', 'Invalid reset link. Please request a new one.')}
          </div>
          <p style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/forgot-password">{t('resetPassword.requestNew', 'Request a new reset link')}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrapper">
      <form className="card login-card" onSubmit={onSubmit} aria-label={t('resetPassword.title')}>
        <div className="login-header">
          <img src="/favicon.svg" alt="" className="login-logo" />
          <h2>{t('resetPassword.title', 'Reset password')}</h2>
          <div style={{ flex: 1 }} />
          <LanguageSelect />
        </div>

        {done ? (
          <>
            <div className="alert success" role="status">
              {t('resetPassword.success', 'Your password has been reset successfully.')}
            </div>
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/login">{t('resetPassword.goToLogin', 'Sign in with your new password')}</Link>
            </p>
          </>
        ) : (
          <>
            {error && <div className="alert error" role="alert">{error}</div>}
            <div className="field">
              <label htmlFor="pw">{t('resetPassword.newPassword', 'New password')}</label>
              <span className="password-input">
                <input
                  id="pw"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </span>
              <ul className="password-rules" aria-label={t('register.password')}>
                <li className={hasMinLength ? 'met' : ''}>{t('register.passwordMinLength', 'At least 8 characters')}</li>
                <li className={hasUppercase ? 'met' : ''}>{t('register.passwordUppercase', 'At least one uppercase letter')}</li>
                <li className={hasSpecialChar ? 'met' : ''}>{t('register.passwordSpecialChar', 'At least one special character')}</li>
              </ul>
            </div>
            <div className="field">
              <label htmlFor="cpw">{t('resetPassword.confirmPassword', 'Confirm new password')}</label>
              <input
                id="cpw"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {confirmPassword && !passwordsMatch && (
                <small className="field-hint error">{t('register.passwordMismatch', 'Passwords do not match.')}</small>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !hasMinLength || !hasUppercase || !hasSpecialChar || !passwordsMatch}
              style={{ width: '100%' }}
            >
              {busy ? t('common.loading') : t('resetPassword.submit', 'Reset password')}
            </button>
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/login">{t('forgotPassword.backToLogin', 'Back to sign in')}</Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
}

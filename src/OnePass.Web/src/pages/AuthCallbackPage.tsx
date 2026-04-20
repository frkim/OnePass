import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';

/**
 * Landing page that the API redirects to after a successful Google sign-in.
 * The OnePass JWT (and an optional `error` reason) are passed as query
 * parameters; we install the token via the auth context and bounce the
 * browser to the requested return URL — never echoing the token back into
 * the address bar.
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const { acceptToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const err = params.get('error');
    const returnUrl = params.get('returnUrl') || '/';
    // Only same-origin SPA paths are honoured to defeat open-redirect attempts.
    const safeReturn = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';

    if (err || !token) {
      // Map provider-specific error codes to a friendly message; everything
      // else falls through to a generic external sign-in failure.
      if (err === 'account_disabled') setError(t('login.accountDisabled'));
      else if (err === 'microsoft_failed' || err === 'microsoft_no_email') setError(t('login.microsoftFailed'));
      else setError(t('login.googleFailed'));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await acceptToken(token, true);
        if (!cancelled) navigate(safeReturn, { replace: true });
      } catch {
        if (!cancelled) setError(t('login.googleFailed'));
      }
    })();
    return () => { cancelled = true; };
  }, [acceptToken, navigate, t]);

  return (
    <div className="login-wrapper">
      <div className="card login-card" role="status" aria-live="polite">
        {error ? (
          <>
            <h2>{t('login.title')}</h2>
            <div className="alert error">{error}</div>
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <a href="/login">{t('common.back')}</a>
            </p>
          </>
        ) : (
          <p style={{ textAlign: 'center' }}>{t('common.loading')}</p>
        )}
      </div>
    </div>
  );
}

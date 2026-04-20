import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

const STORAGE_KEY = 'onepass.cookieConsent';

/**
 * Lightweight, GDPR-friendly consent banner. OnePass uses **only**
 * functional storage (auth token, language, scan queue) — no analytics,
 * no advertising. The banner is therefore informational + acknowledgement,
 * not a full consent matrix. Stores the user's acknowledgement in
 * localStorage so it does not nag on every page load.
 */
export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(typeof window !== 'undefined' && !window.localStorage.getItem(STORAGE_KEY));
  }, []);

  if (!visible) return null;

  function acknowledge() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ackAt: new Date().toISOString(),
      lang: i18n.language,
    }));
    setVisible(false);
  }

  return (
    <div role="dialog" aria-label={t('cookies.title', 'Cookies & local storage')}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: 'var(--surface, #1a1a1a)', color: 'var(--text, #fff)',
        padding: '1rem', borderTop: '1px solid var(--border, #333)',
        display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center',
        justifyContent: 'center',
      }}>
      <p style={{ margin: 0, maxWidth: '60ch' }}>
        {t('cookies.body', 'OnePass stores a sign-in token, your language preference, and any pending offline scans on this device. We do not use analytics or advertising cookies.')}
      </p>
      <button onClick={acknowledge}>
        {t('cookies.ack', 'Got it')}
      </button>
      <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
        {t('cookies.privacy', 'Privacy policy')}
      </a>
    </div>
  );
}

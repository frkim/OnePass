import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';
import { useOrg } from '../org';

/**
 * First-run experience for newly registered users. Asks for an organisation
 * name (the first one becomes the default tenant), the first event name,
 * and basic locale preferences. Drops them on the dashboard once the org
 * is created and made active.
 */
export default function SignupOnboardingPage() {
  const { t, i18n } = useTranslation();
  const { username } = useAuth();
  const { refresh } = useOrg();
  const nav = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [eventName, setEventName] = useState('');
  const [language, setLanguage] = useState(i18n.language ?? 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!username) { nav('/login', { replace: true }); return null; }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setBusy(true); setError(null);
    try {
      const created = await api.createOrg(orgName.trim());
      await refresh(created.id);
      if (eventName.trim()) {
        // Best-effort initial event; user can edit later in Parameters.
        await api.createEvent(created.id, eventName.trim());
      }
      i18n.changeLanguage(language);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="card" onSubmit={onSubmit} style={{ maxWidth: 480, margin: '4rem auto' }}>
        <h1>{t('onboarding.title', 'Welcome to OnePass')}</h1>
        <p style={{ color: 'var(--muted)' }}>
          {t('onboarding.lead', 'Let\u2019s set up your organisation. You can invite teammates afterwards.')}
        </p>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>{t('onboarding.orgName', 'Organisation name')}</label>
          <input value={orgName} onChange={e => setOrgName(e.target.value)} maxLength={120} required />
        </div>
        <div className="field">
          <label>{t('onboarding.eventName', 'First event name (optional)')}</label>
          <input value={eventName} onChange={e => setEventName(e.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <label>{t('onboarding.language', 'Preferred language')}</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
        <button type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('onboarding.submit', 'Create organisation')}
        </button>
      </form>
    </div>
  );
}

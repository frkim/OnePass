import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';

/**
 * Per-user profile + GDPR controls. Lets the user update their display
 * name and preferred language, download a JSON export of every record we
 * hold for them (across all orgs), or delete their account entirely.
 */
export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const [me, setMe] = useState<{ id: string; username: string; role: string; language: string } | null>(null);
  const [language, setLanguage] = useState(i18n.language);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(u => {
      setMe({ id: u.id, username: u.username, role: u.role, language: u.language });
      setLanguage(u.language ?? i18n.language);
    }).catch(err => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t, i18n.language]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    try {
      i18n.changeLanguage(language);
      setInfo(t('profile.saved', 'Profile updated.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onExport() {
    try {
      const blob = await fetch('/api/me/export', { credentials: 'include' }).then(r => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'onepass-export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onDeleteAccount() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('profile.confirmDelete', 'This permanently deletes your account. You will lose access to every organisation. Continue?'))) return;
    try {
      const res = await fetch('/api/me', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      logout();
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!me) return <p>{t('common.loading')}</p>;

  return (
    <>
      <h1>{t('profile.title', 'My profile')}</h1>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}

      <form className="card" onSubmit={onSave}>
        <div className="field">
          <label>{t('profile.username', 'Display name')}</label>
          <input value={me.username} disabled />
        </div>
        <div className="field">
          <label>{t('profile.role', 'Role')}</label>
          <input value={me.role} disabled />
        </div>
        <div className="field">
          <label>{t('profile.language', 'Preferred language')}</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
        <button type="submit">{t('common.save')}</button>
      </form>

      <div className="card">
        <h2>{t('profile.dataPortability', 'Your data')}</h2>
        <p>{t('profile.dataHelp', 'Download a JSON file containing every record OnePass holds for you, across every organisation you belong to.')}</p>
        <button type="button" onClick={onExport}>{t('profile.export', 'Export my data (JSON)')}</button>
      </div>

      <div className="card" style={{ borderColor: 'var(--danger, #c0392b)' }}>
        <h2>{t('profile.danger', 'Danger zone')}</h2>
        <p>{t('profile.deleteHelp', 'Deleting your account is permanent. Audit records for compliance reasons are retained but anonymised.')}</p>
        <button type="button" onClick={onDeleteAccount} style={{ background: 'var(--danger, #c0392b)', color: '#fff' }}>
          {t('profile.delete', 'Delete my account')}
        </button>
      </div>
    </>
  );
}

import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Spinner } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

/**
 * Per-user profile + GDPR controls. Lets the user update their display
 * name and preferred language, download a JSON export of every record we
 * hold for them (across all orgs), or delete their account entirely.
 */
export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const toast = useToast();
  const [me, setMe] = useState<{ id: string; username: string; displayName?: string; role: string; language: string } | null>(null);
  const [language, setLanguage] = useState(i18n.language);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    api.me().then(u => {
      setMe(u);
      setLanguage(u.language ?? i18n.language);
      setDisplayName(u.displayName ?? u.username);
    }).catch(err => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t, i18n.language]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.updateMe({ displayName, language });
      i18n.changeLanguage(language);
      toast.success(t('profile.saved', 'Profile updated.'));
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

  function askDeleteAccount() {
    setConfirm({
      title: t('profile.delete', 'Delete my account'),
      message: t('profile.confirmDelete', 'This permanently deletes your account. You will lose access to every organisation. Continue?'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await fetch('/api/me', { method: 'DELETE', credentials: 'include' });
          if (!res.ok) throw new Error(await res.text());
          logout();
          window.location.href = '/login';
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  if (!me) return <Spinner />;

  return (
    <>
      <PageHeader title={t('profile.title', 'My profile')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={onSave}>
        <div className="field">
          <label>{t('profile.username', 'Display name')}</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={100} />
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
        <div className="form-actions">
          <button type="submit">{t('common.save')}</button>
        </div>
      </form>

      <div className="card">
        <h2>{t('profile.dataPortability', 'Your data')}</h2>
        <p>{t('profile.dataHelp', 'Download a JSON file containing every record OnePass holds for you, across every organisation you belong to.')}</p>
        <button type="button" onClick={onExport}>{t('profile.export', 'Export my data (JSON)')}</button>
      </div>

      <div className="card" style={{ borderColor: 'var(--danger, #c0392b)' }}>
        <h2>{t('profile.danger', 'Danger zone')}</h2>
        <p>{t('profile.deleteHelp', 'Deleting your account is permanent. Audit records for compliance reasons are retained but anonymised.')}</p>
        <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'flex-start' }}>
          <button type="button" className="danger" onClick={askDeleteAccount}>
            {t('profile.delete', 'Delete my account')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        variant={confirm?.variant}
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

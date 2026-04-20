import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Organization } from '../api';
import { useOrg } from '../org';

/**
 * Per-organisation settings: rename, transfer ownership (delegated to the
 * memberships page), and danger-zone delete. The active org is fetched
 * fresh on mount because the OrgSummary in context is the lightweight
 * row from /api/me/orgs and lacks slug-rename history + branding fields.
 */
export default function OrgSettingsPage() {
  const { t } = useTranslation();
  const { active, refresh } = useOrg();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState(active?.name ?? '');
  const [slug, setSlug] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active?.id) return;
    api.getOrg(active.id).then(o => { setOrg(o); setName(o.name); setSlug(o.slug ?? ''); }).catch(() => { /* noop */ });
  }, [active?.id]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null); setInfo(null); setBusy(true);
    try {
      // Only send the fields that actually changed so the server keeps
      // unchanged columns (and does not trigger a no-op slug rename which
      // would still write a redirect row).
      const patch: { name?: string; slug?: string } = {};
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();
      if (trimmedName && trimmedName !== org.name) patch.name = trimmedName;
      if (trimmedSlug && trimmedSlug !== (org.slug ?? '')) patch.slug = trimmedSlug;
      if (Object.keys(patch).length === 0) {
        setInfo(t('common.saved', 'Saved'));
        return;
      }
      const next = await api.updateOrg(org.id, patch);
      setOrg(next);
      setName(next.name);
      setSlug(next.slug ?? '');
      await refresh(next.id);
      setInfo(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!org) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('orgSettings.confirmDelete', 'This permanently deletes the organisation and every event, scan and member it owns. Continue?'))) return;
    try {
      await api.deleteOrg(org.id);
      await refresh();
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!org) return <p>{t('common.loading')}</p>;

  return (
    <>
      <h1>{t('orgSettings.title', 'Organisation settings')}</h1>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}

      <form className="card" onSubmit={onRename}>
        <h2>{t('orgSettings.identity', 'Identity')}</h2>
        <div className="field">
          <label>{t('orgSettings.name', 'Name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={120} required />
        </div>
        <div className="field">
          <label>{t('orgSettings.slug', 'Slug')}</label>
          <input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title={t('orgSettings.slugPattern', 'Lowercase letters, digits and hyphens only.')}
          />
          <small style={{ color: 'var(--muted)' }}>
            {t('orgSettings.slugHelp', 'Used in URLs. Renaming generates a 301 redirect from the old slug.')}
          </small>
        </div>
        <button type="submit" disabled={busy}>{t('common.save')}</button>
      </form>

      <div className="card" style={{ borderColor: 'var(--danger, #c0392b)' }}>
        <h2>{t('orgSettings.danger', 'Danger zone')}</h2>
        <p>{t('orgSettings.dangerHelp', 'Deleting this organisation will remove every member, event and scan. This cannot be undone.')}</p>
        <button type="button" onClick={onDelete} style={{ background: 'var(--danger, #c0392b)', color: '#fff' }}>
          {t('orgSettings.delete', 'Delete organisation')}
        </button>
      </div>
    </>
  );
}

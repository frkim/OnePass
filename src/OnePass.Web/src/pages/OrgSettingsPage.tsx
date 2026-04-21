import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Organization, Activity, EventInfo } from '../api';
import { useOrg } from '../org';
import { PageHeader, Spinner } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

export default function OrgSettingsPage() {
  const { t } = useTranslation();
  const { active, refresh } = useOrg();
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState(active?.name ?? '');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [defaultEventId, setDefaultEventId] = useState<string>('');
  const [defaultActivityId, setDefaultActivityId] = useState<string>('');

  useEffect(() => {
    if (!active?.id) return;
    api.getOrg(active.id).then(o => { setOrg(o); setName(o.name); setSlug(o.slug ?? ''); }).catch(() => { /* noop */ });
  }, [active?.id]);

  useEffect(() => {
    if (!active?.id) return;
    (async () => {
      try {
        const [evts, a, orgData] = await Promise.all([
          api.listEvents(active.id),
          api.listActivities(),
          api.getOrg(active.id),
        ]);
        setEvents(evts);
        setActivities(a);
        setDefaultEventId(orgData.defaultEventId ?? '');
        const liveEvent = evts.find(e => e.id === (orgData.defaultEventId ?? '')) ?? evts.find(e => !e.isArchived) ?? evts[0] ?? null;
        setDefaultActivityId(liveEvent?.defaultActivityId ?? '');
      } catch { /* noop */ }
    })();
  }, [active?.id]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null); setBusy(true);
    try {
      const patch: { name?: string; slug?: string } = {};
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();
      if (trimmedName && trimmedName !== org.name) patch.name = trimmedName;
      if (trimmedSlug && trimmedSlug !== (org.slug ?? '')) patch.slug = trimmedSlug;
      if (Object.keys(patch).length === 0) {
        toast.success(t('common.saved', 'Saved'));
        return;
      }
      const next = await api.updateOrg(org.id, patch);
      setOrg(next);
      setName(next.name);
      setSlug(next.slug ?? '');
      await refresh(next.id);
      toast.success(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally { setBusy(false); }
  }

  async function onSaveDefaults(e: FormEvent) {
    e.preventDefault();
    if (!active?.id) return;
    setError(null); setBusy(true);
    try {
      await api.updateOrg(active.id, { defaultEventId: defaultEventId || null });
      const targetEvent = events.find(ev => ev.id === defaultEventId);
      if (targetEvent) {
        await api.updateEvent(active.id, targetEvent.id, {
          defaultActivityId: defaultActivityId || null,
        });
      }
      toast.success(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally { setBusy(false); }
  }

  function askDelete() {
    if (!org) return;
    setConfirm({
      title: t('orgSettings.delete', 'Delete organisation'),
      message: t('orgSettings.confirmDelete', 'This permanently deletes the organisation and every event, scan and member it owns. Continue?'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.deleteOrg(org.id);
          await refresh();
          window.location.href = '/';
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  if (!org) return <Spinner />;

  return (
    <>
      <PageHeader title={t('orgSettings.title', 'Organisation settings')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={onRename}>
        <h2>{t('orgSettings.identity', 'Identity')}</h2>
        <div className="grid">
          <div className="field">
            <label>{t('orgSettings.orgId', 'Organisation ID')}</label>
            <input value={org.id} readOnly disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
          </div>
          <div className="field">
            <label>{t('orgSettings.name', 'Display name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={120} required />
          </div>
          <div className="field">
            <label>{t('orgSettings.slug', 'Slug')}</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title={t('orgSettings.slugPattern', 'Lowercase letters, digits and hyphens only.')} />
            <small style={{ color: 'var(--muted)' }}>
              {t('orgSettings.slugHelp', 'Used in URLs. Renaming generates a 301 redirect from the old slug.')}
            </small>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={busy}>{t('common.save')}</button>
        </div>
      </form>

      <form className="card" onSubmit={onSaveDefaults}>
        <h2>{t('orgSettings.defaults', 'Defaults')}</h2>
        <div className="field">
          <label>{t('parameters.defaultEvent', 'Default event')}</label>
          <select value={defaultEventId} onChange={e => setDefaultEventId(e.target.value)}>
            <option value="">{t('parameters.none', 'None')}</option>
            {events.filter(ev => !ev.isArchived).map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <small style={{ color: 'var(--muted)' }}>{t('parameters.defaultEventHelp', 'Pre-selected event for scanning and activities.')}</small>
        </div>
        <div className="field">
          <label>{t('parameters.defaultActivity', 'Default activity')}</label>
          <select value={defaultActivityId} onChange={e => setDefaultActivityId(e.target.value)}>
            <option value="">{t('parameters.none', 'None')}</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <small style={{ color: 'var(--muted)' }}>{t('parameters.defaultActivityHelp', 'Pre-selected on the Scan page when a user has not chosen their own default.')}</small>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={busy}>{t('common.save')}</button>
        </div>
      </form>

      <div className="card" style={{ borderColor: 'var(--danger, #c0392b)' }}>
        <h2>{t('orgSettings.danger', 'Danger zone')}</h2>
        <p style={{ color: 'var(--muted)' }}>{t('orgSettings.dangerHelp', 'Deleting this organisation will remove every member, event and scan. This cannot be undone.')}</p>
        <div className="form-actions" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'flex-start' }}>
          <button type="button" className="danger" onClick={askDelete}>
            {t('orgSettings.delete', 'Delete organisation')}
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

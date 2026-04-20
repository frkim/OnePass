import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, EventInfo } from '../api';
import { useAuth } from '../auth';
import { useOrg } from '../org';
import { PageHeader } from '../components/PageShell';
import { useToast, ToastContainer } from '../components/Toast';

/**
 * Admin "Parameters" page. After the SaaS migration the global Settings row
 * is gone — Event Name + default activity now live on the active EventEntity
 * for the active organisation. The legacy "Reset all data" action remains
 * removed (see docs/saas-migration-plan.md Phase 3).
 */
export default function ParametersPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { active } = useOrg();
  const toast = useToast();
  const isAdmin = role === 'Admin';

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [eventName, setEventName] = useState('');
  const [defaultActivityId, setDefaultActivityId] = useState<string>('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [myDefault, setMyDefault] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active?.id) return;
    (async () => {
      try {
        const [events, a, me] = await Promise.all([
          api.listEvents(active.id),
          api.listActivities(),
          api.me(),
        ]);
        setActivities(a);
        setMyDefault(me.defaultActivityId ?? '');
        const live = events.find(e => !e.isArchived) ?? events[0] ?? null;
        setEventInfo(live);
        setEventName(live?.name ?? '');
        setDefaultActivityId(live?.defaultActivityId ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    })();
  }, [t, active?.id]);

  async function onSaveAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!active?.id || !eventInfo) return;
    try {
      const next = await api.updateEvent(active.id, eventInfo.id, {
        name: eventName,
        defaultActivityId: defaultActivityId || null,
      });
      setEventInfo(next);
      toast.success(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onSaveMyDefault(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api.updateMe({ defaultActivityId: myDefault || null });
      toast.success(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <PageHeader title={t('parameters.title')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      {isAdmin && eventInfo && (
        <form className="card" onSubmit={onSaveAdmin}>
          <h2>{t('parameters.title')}</h2>
          <div className="field">
            <label>{t('parameters.eventName')}</label>
            <input
              name="eventName"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              maxLength={120}
            />
            <small style={{ color: 'var(--muted)' }}>{t('parameters.eventNameHelp')}</small>
          </div>
          <div className="field">
            <label>{t('parameters.defaultActivity')}</label>
            <select
              name="defaultActivityId"
              value={defaultActivityId}
              onChange={e => setDefaultActivityId(e.target.value)}
            >
              <option value="">{t('parameters.none')}</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <small style={{ color: 'var(--muted)' }}>{t('parameters.defaultActivityHelp')}</small>
          </div>
          <div className="form-actions">
            <button type="submit">{t('common.save')}</button>
          </div>
        </form>
      )}

      {isAdmin && !eventInfo && (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>
            {t('parameters.noEvent', 'Create an event for this organisation to configure its name and default activity.')}
          </p>
        </div>
      )}

      <form className="card" onSubmit={onSaveMyDefault}>
        <h2>{t('parameters.myDefaultActivity')}</h2>
        <div className="field">
          <label>{t('parameters.myDefaultActivity')}</label>
          <select value={myDefault} onChange={e => setMyDefault(e.target.value)}>
            <option value="">{t('parameters.none')}</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <small style={{ color: 'var(--muted)' }}>{t('parameters.myDefaultActivityHelp')}</small>
        </div>
        <div className="form-actions">
          <button type="submit">{t('common.save')}</button>
        </div>
      </form>
    </>
  );
}
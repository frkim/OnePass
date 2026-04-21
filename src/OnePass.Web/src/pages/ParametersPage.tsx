import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, EventInfo } from '../api';
import { useOrg } from '../org';
import { PageHeader } from '../components/PageShell';
import { useToast, ToastContainer } from '../components/Toast';

/**
 * "My Settings" page — user-level default overrides.
 */
export default function ParametersPage() {
  const { t } = useTranslation();
  const { active } = useOrg();
  const toast = useToast();

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [myDefaultActivity, setMyDefaultActivity] = useState<string>('');
  const [myDefaultEvent, setMyDefaultEvent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active?.id) return;
    (async () => {
      try {
        const [evts, a, me] = await Promise.all([
          api.listEvents(active.id),
          api.listActivities(),
          api.me(),
        ]);
        setActivities(a);
        setEvents(evts);
        setMyDefaultActivity(me.defaultActivityId ?? '');
        setMyDefaultEvent(me.defaultEventId ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    })();
  }, [t, active?.id]);

  async function onSaveMyDefaults(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api.updateMe({
        defaultActivityId: myDefaultActivity || null,
        defaultEventId: myDefaultEvent || null,
      });
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

      <form className="card" onSubmit={onSaveMyDefaults}>
        <h2>{t('parameters.myDefaults', 'My defaults')}</h2>
        <div className="field">
          <label>{t('parameters.myDefaultEvent')}</label>
          <select value={myDefaultEvent} onChange={e => setMyDefaultEvent(e.target.value)}>
            <option value="">{t('parameters.none')}</option>
            {events.filter(ev => !ev.isArchived).map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <small style={{ color: 'var(--muted)' }}>{t('parameters.myDefaultEventHelp')}</small>
        </div>
        <div className="field">
          <label>{t('parameters.myDefaultActivity')}</label>
          <select value={myDefaultActivity} onChange={e => setMyDefaultActivity(e.target.value)}>
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
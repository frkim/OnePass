import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, Settings } from '../api';
import { useAuth } from '../auth';

/**
 * Admin "Parameters" page. Hosts the global Event Name, the global default
 * activity, and the per-user default activity. The legacy "Reset all data"
 * action has been removed — it was a global, cross-tenant destructive
 * endpoint (see docs/saas-migration-plan.md §Phase 3).
 */
export default function ParametersPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isAdmin = role === 'Admin';

  const [settings, setSettings] = useState<Settings>({ eventName: '', defaultActivityId: null });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [myDefault, setMyDefault] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, a, me] = await Promise.all([api.getSettings(), api.listActivities(), api.me()]);
        setSettings(s);
        setActivities(a);
        setMyDefault(me.defaultActivityId ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    })();
  }, [t]);

  async function onSaveAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setInfo(null);
    try {
      const next = await api.updateSettings({
        eventName: settings.eventName,
        defaultActivityId: settings.defaultActivityId ?? '',
      });
      setSettings(next);
      setInfo(t('parameters.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onSaveMyDefault(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setInfo(null);
    try {
      await api.setMyDefaultActivity(myDefault || null);
      setInfo(t('parameters.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <h1>{t('parameters.title')}</h1>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}

      {isAdmin && (
        <form className="card" onSubmit={onSaveAdmin}>
          <h2>{t('parameters.title')}</h2>
          <div className="field">
            <label>{t('parameters.eventName')}</label>
            <input
              name="eventName"
              value={settings.eventName}
              onChange={e => setSettings(s => ({ ...s, eventName: e.target.value }))}
              maxLength={120}
            />
            <small style={{ color: 'var(--muted)' }}>{t('parameters.eventNameHelp')}</small>
          </div>
          <div className="field">
            <label>{t('parameters.defaultActivity')}</label>
            <select
              name="defaultActivityId"
              value={settings.defaultActivityId ?? ''}
              onChange={e => setSettings(s => ({ ...s, defaultActivityId: e.target.value || null }))}
            >
              <option value="">{t('parameters.none')}</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <small style={{ color: 'var(--muted)' }}>{t('parameters.defaultActivityHelp')}</small>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit">{t('common.save')}</button>
          </div>
        </form>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit">{t('common.save')}</button>
        </div>
      </form>
    </>
  );
}

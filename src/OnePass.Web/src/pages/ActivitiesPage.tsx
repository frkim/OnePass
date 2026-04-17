import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, Participant } from '../api';
import { useAuth } from '../auth';
import { formatDate } from '../i18n';

export default function ActivitiesPage() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const [list, setList] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
  const [limitScans, setLimitScans] = useState(false);

  const refresh = () => api.listActivities().then(setList).catch(() => setError(t('common.error')));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;

    // Client-side duplicate name guard
    if (list.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      setError(t('activity.duplicateName'));
      return;
    }

    // Confirmation before saving
    if (!window.confirm(t('activity.confirmCreate', { name }))) return;

    try {
      await api.createActivity({
        name,
        description: String(data.get('description') ?? ''),
        startsAt: new Date(String(data.get('startsAt'))).toISOString(),
        endsAt: new Date(String(data.get('endsAt'))).toISOString(),
        maxScansPerParticipant: limitScans ? Number(data.get('maxScans') || 1) : -1,
      });
      form.reset();
      setLimitScans(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!participants[id]) {
      const p = await api.listParticipants(id);
      setParticipants(prev => ({ ...prev, [id]: p }));
    }
  }

  async function onAddParticipant(e: FormEvent<HTMLFormElement>, activityId: string) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get('displayName') ?? '').trim();
    if (!name) return;
    const created = await api.addParticipant(activityId, name, String(form.get('email') ?? '') || undefined);
    setParticipants(prev => ({ ...prev, [activityId]: [...(prev[activityId] || []), created] }));
    formEl.reset();
  }

  const isAdmin = role === 'Admin';

  // Defaults for the "create activity" form: name=activity_YYYYMMDD, starts=now, ends=now+1 month.
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const defaultName = `activity_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const defaultStart = toLocal(now);
  const defaultEnd = toLocal(oneMonthLater);

  return (
    <>
      <h1>{t('nav.activities')}</h1>
      {error && <div className="alert error">{error}</div>}

      {isAdmin && (
        <form className="card" onSubmit={onCreate}>
          <h2>{t('activity.create')}</h2>
          <div className="grid">
            <div className="field"><label>{t('activity.name')}</label><input name="name" defaultValue={defaultName} required /></div>
            <div className="field"><label>{t('activity.description')}</label><input name="description" /></div>
            <div className="field"><label>{t('activity.startsAt')}</label><input name="startsAt" type="datetime-local" defaultValue={defaultStart} required /></div>
            <div className="field"><label>{t('activity.endsAt')}</label><input name="endsAt" type="datetime-local" defaultValue={defaultEnd} required /></div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={limitScans}
                  onChange={e => setLimitScans(e.target.checked)}
                />
                {t('activity.limitMaxScans')}
              </label>
              {limitScans ? (
                <input name="maxScans" type="number" min={1} defaultValue={100} aria-label={t('activity.maxScans')} />
              ) : (
                <small style={{ color: 'var(--muted)' }}>{t('activity.unlimited')}</small>
              )}
            </div>
          </div>
          <button type="submit">{t('common.save')}</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('activity.name')}</th>
              <th>{t('activity.startsAt')}</th>
              <th>{t('activity.endsAt')}</th>
              <th>{t('activity.maxScans')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td><a onClick={() => toggleExpand(a.id)} style={{ cursor: 'pointer' }}>{a.name}</a></td>
                <td>{formatDate(a.startsAt, i18n.language)}</td>
                <td>{formatDate(a.endsAt, i18n.language)}</td>
                <td>{a.maxScansPerParticipant <= 0 ? t('activity.unlimited') : a.maxScansPerParticipant}</td>
                <td>
                  {isAdmin && (
                    <button className="danger" onClick={async () => {
                      if (!window.confirm(`${t('users.delete')}: ${a.name}?`)) return;
                      await api.deleteActivity(a.id);
                      refresh();
                    }}>
                      {t('users.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>{t('dashboard.noData')}</td></tr>}
          </tbody>
        </table>
      </div>

      {expanded && (
        <div className="card">
          <h2>{t('activity.participants')}</h2>
          <form onSubmit={e => onAddParticipant(e, expanded)} className="row" style={{ marginBottom: '0.75rem' }}>
            <input name="displayName" placeholder={t('activity.displayName')} required style={{ maxWidth: 240 }} />
            <input name="email" type="email" placeholder={t('activity.email')} style={{ maxWidth: 240 }} />
            <button type="submit">{t('activity.addParticipant')}</button>
          </form>
          <table>
            <thead><tr><th>{t('activity.displayName')}</th><th>ID</th><th>{t('activity.email')}</th></tr></thead>
            <tbody>
              {(participants[expanded] || []).map(p => (
                <tr key={p.id}><td>{p.displayName}</td><td><code>{p.id}</code></td><td>{p.email}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

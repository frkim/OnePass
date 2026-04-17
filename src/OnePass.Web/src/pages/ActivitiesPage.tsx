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

  const refresh = () => api.listActivities().then(setList).catch(() => setError(t('common.error')));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createActivity({
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        startsAt: new Date(String(form.get('startsAt'))).toISOString(),
        endsAt: new Date(String(form.get('endsAt'))).toISOString(),
        maxScansPerParticipant: Number(form.get('maxScans') || 1),
      });
      e.currentTarget.reset();
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
    const form = new FormData(e.currentTarget);
    const name = String(form.get('displayName') ?? '').trim();
    if (!name) return;
    const created = await api.addParticipant(activityId, name, String(form.get('email') ?? '') || undefined);
    setParticipants(prev => ({ ...prev, [activityId]: [...(prev[activityId] || []), created] }));
    e.currentTarget.reset();
  }

  const isAdmin = role === 'Admin';

  return (
    <>
      <h1>{t('nav.activities')}</h1>
      {error && <div className="alert error">{error}</div>}

      {isAdmin && (
        <form className="card" onSubmit={onCreate}>
          <h2>{t('activity.create')}</h2>
          <div className="grid">
            <div className="field"><label>{t('activity.name')}</label><input name="name" required /></div>
            <div className="field"><label>{t('activity.description')}</label><input name="description" /></div>
            <div className="field"><label>{t('activity.startsAt')}</label><input name="startsAt" type="datetime-local" required /></div>
            <div className="field"><label>{t('activity.endsAt')}</label><input name="endsAt" type="datetime-local" required /></div>
            <div className="field"><label>{t('activity.maxScans')}</label><input name="maxScans" type="number" min={1} defaultValue={1} /></div>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td><a onClick={() => toggleExpand(a.id)} style={{ cursor: 'pointer' }}>{a.name}</a></td>
                <td>{formatDate(a.startsAt, i18n.language)}</td>
                <td>{formatDate(a.endsAt, i18n.language)}</td>
                <td>
                  {isAdmin && (
                    <button className="danger" onClick={async () => { await api.deleteActivity(a.id); refresh(); }}>
                      {t('users.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>{t('dashboard.noData')}</td></tr>}
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

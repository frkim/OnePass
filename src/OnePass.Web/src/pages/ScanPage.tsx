import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity } from '../api';
import { scanOrQueue, pendingCount, flushQueue } from '../scanQueue';

export default function ScanPage() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [queued, setQueued] = useState(pendingCount());

  useEffect(() => {
    api.listActivities().then(list => {
      setActivities(list);
      if (list[0]) setActivityId(list[0].id);
    });
    const h = () => setQueued(pendingCount());
    window.addEventListener('online', async () => { await flushQueue(); setQueued(pendingCount()); });
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activityId || !participantId) return;
    try {
      const res = await scanOrQueue(activityId, participantId.trim());
      setMessage({ type: res === 'sent' ? 'success' : 'info', text: res === 'sent' ? t('scan.success') : t('scan.offlineQueued') });
      setParticipantId('');
      setQueued(pendingCount());
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  }

  return (
    <>
      <h1>{t('scan.title')}</h1>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      {queued > 0 && <div className="alert info">{t('scan.queued', { count: queued })}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="act">{t('scan.chooseActivity')}</label>
          <select id="act" value={activityId} onChange={e => setActivityId(e.target.value)}>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pid">{t('scan.participantId')}</label>
          <input id="pid" value={participantId} onChange={e => setParticipantId(e.target.value)} required autoFocus />
        </div>
        <button type="submit">{t('scan.submit')}</button>
      </form>
    </>
  );
}

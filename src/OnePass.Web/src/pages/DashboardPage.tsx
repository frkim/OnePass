import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title } from 'chart.js';
import { api, Activity, ActivityStats, getToken } from '../api';
import { PageHeader, EmptyState } from '../components/PageShell';

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title);

export default function DashboardPage() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listActivities()
      .then(list => {
        setActivities(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch(() => setError(t('common.error')));
  }, [t]);

  useEffect(() => {
    if (!selected) { setStats(null); return; }
    api.stats(selected).then(setStats).catch(() => setError(t('common.error')));
  }, [selected, t]);

  const totalScans = stats?.totalScans ?? 0;
  const uniqueParticipants = stats?.uniqueParticipants ?? 0;

  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row">
          <label htmlFor="act" style={{ margin: 0 }}>{t('scan.chooseActivity')}</label>
          <select id="act" value={selected} onChange={e => setSelected(e.target.value)} style={{ maxWidth: 320 }}>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {selected && (
            <button className="btn" type="button" onClick={async () => {
              try {
                const resp = await fetch(api.reportCsvUrl(selected), {
                  headers: { 'Authorization': `Bearer ${getToken()}` },
                });
                if (!resp.ok) throw new Error('CSV export failed');
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'report.csv'; a.click();
                URL.revokeObjectURL(url);
              } catch { setError(t('common.error')); }
            }}>
              {t('dashboard.exportCsv')}
            </button>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="card stat">
          <div className="n">{activities.length}</div>
          <div className="l">{t('dashboard.totalActivities')}</div>
        </div>
        <div className="card stat">
          <div className="n">{totalScans}</div>
          <div className="l">{t('dashboard.totalScans')}</div>
        </div>
        <div className="card stat">
          <div className="n">{uniqueParticipants}</div>
          <div className="l">{t('dashboard.uniqueParticipants')}</div>
        </div>
      </div>

      <div className="card">
        <h2>{t('dashboard.scansOverTime')}</h2>
        {stats && stats.scansByDay.length > 0 ? (
          <Bar
            data={{
              labels: stats.scansByDay.map(b => b.day),
              datasets: [{ label: t('dashboard.totalScans'), data: stats.scansByDay.map(b => b.count), backgroundColor: '#0b5fff' }],
            }}
            options={{ responsive: true, plugins: { legend: { display: false } } }}
          />
        ) : (
          <EmptyState icon="📊" message={t('dashboard.noData')} />
        )}
      </div>
    </>
  );
}

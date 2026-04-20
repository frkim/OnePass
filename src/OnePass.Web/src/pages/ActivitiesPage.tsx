import { useEffect, useState, FormEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, Participant } from '../api';
import { useAuth } from '../auth';
import { formatDate } from '../i18n';
import { ParticipantsTable } from '../components/ParticipantsTable';
import { PageHeader, EmptyState, Spinner } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';
import { ActivityDialog, ActivityDialogData } from '../components/ActivityDialog';

export default function ActivitiesPage() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
  const [scanTimes, setScanTimes] = useState<Record<string, Record<string, string>>>({});
  const [dialog, setDialog] = useState<{ mode: 'add' | 'edit'; activity?: Activity } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  const refresh = useCallback(() => {
    api.listActivities()
      .then(setList)
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDialogSave(data: ActivityDialogData) {
    setError(null);
    if (dialog?.mode === 'edit' && dialog.activity) {
      // Edit existing activity
      try {
        const updated = await api.updateActivity(dialog.activity.id, {
          name: data.name,
          description: data.description,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          maxScansPerParticipant: data.maxScansPerParticipant,
        });
        setList(prev => prev.map(a => (a.id === updated.id ? updated : a)));
        setDialog(null);
        toast.success(t('common.saved', 'Saved'));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    } else {
      // Create new activity — confirm first
      setConfirm({
        title: t('activity.create'),
        message: t('activity.confirmCreate', { name: data.name }),
        onConfirm: async () => {
          setConfirm(null);
          try {
            await api.createActivity({
              name: data.name,
              description: data.description,
              startsAt: data.startsAt,
              endsAt: data.endsAt,
              maxScansPerParticipant: data.maxScansPerParticipant,
            });
            setDialog(null);
            toast.success(t('common.saved', 'Saved'));
            refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          }
        },
      });
    }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!participants[id]) {
      const [p, scans] = await Promise.all([api.listParticipants(id), api.listScans(id)]);
      setParticipants(prev => ({ ...prev, [id]: p }));
      const times: Record<string, string> = {};
      for (const s of scans) {
        if (!times[s.participantId] || s.scannedAt > times[s.participantId]) {
          times[s.participantId] = s.scannedAt;
        }
      }
      setScanTimes(prev => ({ ...prev, [id]: times }));
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
    toast.success(t('activity.addParticipant') + ': ' + created.displayName);
  }

  function askResetScans(a: Activity) {
    setConfirm({
      title: t('activity.resetScans'),
      message: t('activity.resetScansConfirm', { name: a.name }),
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const r = await api.resetActivityScans(a.id);
          toast.success(t('activity.resetScansSuccess', { p: r.participantsDeleted, s: r.scansDeleted }));
          if (expanded === a.id) {
            const p = await api.listParticipants(a.id);
            setParticipants(prev => ({ ...prev, [a.id]: p }));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  function askDelete(a: Activity) {
    setConfirm({
      title: t('users.delete'),
      message: `${t('users.delete')}: ${a.name}?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.deleteActivity(a.id);
          toast.success(t('users.delete') + ': ' + a.name);
          refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  const isAdmin = role === 'Admin';

  return (
    <>
      <PageHeader title={t('nav.activities')} actions={
        isAdmin ? (
          <button onClick={() => setDialog({ mode: 'add' })}>
            {t('activity.add')}
          </button>
        ) : undefined
      } />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {loading ? <Spinner /> : list.length === 0 ? (
          <EmptyState icon="📋" message={t('dashboard.noData')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('activity.name')}</th>
                <th>{t('activity.startsAt')}</th>
                <th>{t('activity.endsAt')}</th>
                <th>{t('activity.maxScans')}</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td>
                    <a onClick={() => toggleExpand(a.id)} style={{ cursor: 'pointer' }}>{a.name}</a>
                    {a.isDefault && (
                      <span className="status-badge status-badge-info" style={{ marginLeft: '0.5rem' }}>
                        {t('activity.default')}
                      </span>
                    )}
                  </td>
                  <td>{formatDate(a.startsAt, i18n.language)}</td>
                  <td>{formatDate(a.endsAt, i18n.language)}</td>
                  <td>{a.maxScansPerParticipant <= 0 ? t('activity.unlimited') : a.maxScansPerParticipant}</td>
                  {isAdmin && (
                    <td>
                      <div className="actions-cell">
                        <button className="secondary" onClick={() => setDialog({ mode: 'edit', activity: a })}
                          title={t('activity.edit') as string}>
                          {t('activity.edit')}
                        </button>
                        <button className="secondary" onClick={() => askResetScans(a)}>
                          {t('activity.resetScans')}
                        </button>
                        <button className="danger" onClick={() => askDelete(a)}
                          disabled={list.length <= 1} title={list.length <= 1 ? t('activity.cannotDeleteLast') : undefined}>
                          {t('users.delete')}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {expanded && (
        <div className="card">
          <h2>{t('activity.participants')}</h2>
          <form onSubmit={e => onAddParticipant(e, expanded)} className="row" style={{ marginBottom: '0.75rem' }}>
            <input name="displayName" placeholder={t('activity.displayName')} required style={{ maxWidth: 240 }} />
            <input name="email" type="email" placeholder={t('activity.email')} style={{ maxWidth: 240 }} />
            <button type="submit">{t('activity.addParticipant')}</button>
          </form>
          <ParticipantsTable
            participants={participants[expanded] || []}
            canDelete={isAdmin}
            scanTimes={scanTimes[expanded]}
            onDelete={async (p) => {
              try {
                await api.deleteParticipant(expanded, p.id);
                setParticipants(prev => ({
                  ...prev,
                  [expanded]: (prev[expanded] || []).filter(x => x.id !== p.id),
                }));
                toast.success(t('participants.delete') + ': ' + p.displayName);
              } catch (err) {
                setError(err instanceof Error ? err.message : t('common.error'));
              }
            }}
          />
        </div>
      )}

      <ActivityDialog
        open={!!dialog}
        activity={dialog?.mode === 'edit' ? dialog.activity : null}
        existingNames={list.map(a => a.name)}
        onSave={onDialogSave}
        onCancel={() => setDialog(null)}
      />

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

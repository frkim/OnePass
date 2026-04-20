import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity } from '../api';
import { useAuth } from '../auth';
import { useOrg } from '../org';
import { formatDate } from '../i18n';
import { PageHeader, EmptyState, Spinner } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';
import { ActivityDialog, ActivityDialogData } from '../components/ActivityDialog';

export default function ActivitiesPage() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const { active } = useOrg();
  const toast = useToast();
  const [list, setList] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'add' | 'edit'; activity?: Activity } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

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

  async function makeDefault(a: Activity) {
    if (!active?.id) return;
    try {
      const events = await api.listEvents(active.id);
      const live = events.find(e => !e.isArchived) ?? events[0];
      if (!live) return;
      await api.updateEvent(active.id, live.id, { defaultActivityId: a.id });
      setList(prev => prev.map(x => ({ ...x, isDefault: x.id === a.id })));
      toast.success(t('activity.default') + ': ' + a.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
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
          refresh();
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
                    {isAdmin ? (
                      <a onClick={() => setDialog({ mode: 'edit', activity: a })} style={{ cursor: 'pointer' }}>{a.name}</a>
                    ) : (
                      <span>{a.name}</span>
                    )}
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
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-menu" ref={menuOpen === a.id ? menuRef : undefined}>
                        <button className="secondary row-menu-trigger" onClick={() => setMenuOpen(menuOpen === a.id ? null : a.id)}>⋯</button>
                        {menuOpen === a.id && (
                          <div className="row-menu-panel">
                            {!a.isDefault && (
                              <button className="row-menu-item" onClick={() => { setMenuOpen(null); makeDefault(a); }}>
                                {t('activity.makeDefault', 'Make default')}
                              </button>
                            )}
                            <button className="row-menu-item" onClick={() => { setMenuOpen(null); askResetScans(a); }}>
                              {t('activity.resetScans')}
                            </button>
                            <button className="row-menu-item row-menu-item-danger" onClick={() => { setMenuOpen(null); askDelete(a); }}
                              disabled={list.length <= 1} title={list.length <= 1 ? t('activity.cannotDeleteLast') : undefined}>
                              {t('users.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, EventInfo } from '../api';
import { useAuth } from '../auth';
import { useOrg } from '../org';
import { formatDate } from '../i18n';
import { PageHeader, EmptyState, Spinner } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';
import { EventDialog, EventDialogData } from '../components/EventDialog';

export default function EventsPage() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const { active } = useOrg();
  const toast = useToast();
  const [list, setList] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'add' | 'edit'; event?: EventInfo } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const refresh = useCallback(() => {
    if (!active?.id) { setLoading(false); return; }
    api.listEvents(active.id)
      .then(setList)
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false));
  }, [active?.id, t]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDialogSave(data: EventDialogData) {
    if (!active?.id) return;
    setError(null);
    if (dialog?.mode === 'edit' && dialog.event) {
      try {
        const updated = await api.updateEvent(active.id, dialog.event.id, {
          name: data.name,
          description: data.description || null,
          venue: data.venue || null,
          startsAt: data.startsAt || null,
          endsAt: data.endsAt || null,
        });
        setList(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        setDialog(null);
        toast.success(t('common.saved', 'Saved'));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    } else {
      setConfirm({
        title: t('event.create'),
        message: t('event.confirmCreate', { name: data.name }),
        onConfirm: async () => {
          setConfirm(null);
          try {
            const created = await api.createEvent(active!.id, data.name, data.slug || undefined);
            if (data.description || data.venue || data.startsAt || data.endsAt) {
              await api.updateEvent(active!.id, created.id, {
                description: data.description || null,
                venue: data.venue || null,
                startsAt: data.startsAt || null,
                endsAt: data.endsAt || null,
              });
            }
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

  function toggleArchive(ev: EventInfo) {
    if (!active?.id) return;
    const newArchived = !ev.isArchived;
    api.updateEvent(active.id, ev.id, { isArchived: newArchived })
      .then(updated => {
        setList(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        toast.success(t(newArchived ? 'event.archived' : 'event.unarchived'));
      })
      .catch(err => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function askDelete(ev: EventInfo) {
    setConfirm({
      title: t('users.delete'),
      message: `${t('users.delete')}: ${ev.name}?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        if (!active?.id) return;
        try {
          await api.deleteEvent(active.id, ev.id);
          toast.success(t('users.delete') + ': ' + ev.name);
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
      <PageHeader title={t('nav.events')} actions={
        isAdmin ? (
          <button onClick={() => setDialog({ mode: 'add' })}>
            {t('event.add')}
          </button>
        ) : undefined
      } />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {loading ? <Spinner /> : list.length === 0 ? (
          <EmptyState icon="📅" message={t('dashboard.noData')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('event.name')}</th>
                <th>{t('event.slug')}</th>
                <th>{t('event.venue')}</th>
                <th>{t('event.startsAt')}</th>
                <th>{t('event.endsAt')}</th>
                <th>{t('event.status')}</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(ev => (
                <tr key={ev.id}>
                  <td>
                    {isAdmin ? (
                      <a onClick={() => setDialog({ mode: 'edit', event: ev })} style={{ cursor: 'pointer' }}>{ev.name}</a>
                    ) : (
                      <span>{ev.name}</span>
                    )}
                  </td>
                  <td><code>{ev.slug}</code></td>
                  <td>{ev.venue ?? '—'}</td>
                  <td>{ev.startsAt ? formatDate(ev.startsAt, i18n.language) : '—'}</td>
                  <td>{ev.endsAt ? formatDate(ev.endsAt, i18n.language) : '—'}</td>
                  <td>
                    <span className={`status-badge ${ev.isArchived ? 'status-badge-muted' : 'status-badge-success'}`}>
                      {t(ev.isArchived ? 'event.archivedLabel' : 'event.liveLabel')}
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-menu" ref={menuOpen === ev.id ? menuRef : undefined}>
                        <button className="secondary row-menu-trigger" onClick={() => setMenuOpen(menuOpen === ev.id ? null : ev.id)}>⋯</button>
                        {menuOpen === ev.id && (
                          <div className="row-menu-panel">
                            <button className="row-menu-item" onClick={() => { setMenuOpen(null); toggleArchive(ev); }}>
                              {t(ev.isArchived ? 'event.unarchive' : 'event.archive')}
                            </button>
                            <button className="row-menu-item row-menu-item-danger" onClick={() => { setMenuOpen(null); askDelete(ev); }}>
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

      <EventDialog
        open={!!dialog}
        event={dialog?.mode === 'edit' ? dialog.event : null}
        existingNames={list.map(e => e.name)}
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

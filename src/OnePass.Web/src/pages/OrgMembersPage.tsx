import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Membership } from '../api';
import { useOrg } from '../org';
import { PageHeader, EmptyState, Spinner, StatusBadge } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

const ROLES = ['OrgOwner', 'OrgAdmin', 'EventCoordinator', 'Scanner', 'Viewer'] as const;

export default function OrgMembersPage() {
  const { t } = useTranslation();
  const { active } = useOrg();
  const toast = useToast();
  const [rows, setRows] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!active?.id) return;
    try {
      setRows(await api.listMemberships(active.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [active?.id, t]);

  useEffect(() => { reload(); }, [reload]);

  async function onChangeRole(m: Membership, role: string) {
    if (!active?.id) return;
    try {
      await api.updateMembership(active.id, m.userId, { role });
      toast.success(t('common.saved', 'Saved'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function askRemove(m: Membership) {
    setConfirm({
      title: t('common.remove', 'Remove'),
      message: t('members.confirmRemove', 'Remove this member from the organisation?'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        if (!active?.id) return;
        try {
          await api.removeMembership(active.id, m.userId);
          toast.success(t('common.remove', 'Remove') + ': ' + m.userId);
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  return (
    <>
      <PageHeader title={t('members.title', 'Members')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="👥" message={t('members.empty', 'No members yet.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('members.user', 'User')}</th>
                <th>{t('members.role', 'Role')}</th>
                <th>{t('members.status', 'Status')}</th>
                <th>{t('members.joinedAt', 'Joined')}</th>
                <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.userId}>
                  <td><code style={{ fontSize: '0.82rem' }}>{m.userId}</code></td>
                  <td>
                    <select value={m.role} onChange={e => onChangeRole(m, e.target.value)}
                      style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <StatusBadge
                      status={m.status}
                      variant={m.status === 'Active' ? 'success' : 'muted'}
                    />
                  </td>
                  <td>{new Date(m.joinedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="danger" onClick={() => askRemove(m)}>
                        {t('common.remove', 'Remove')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

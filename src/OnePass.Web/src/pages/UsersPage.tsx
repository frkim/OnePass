import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, AppUser } from '../api';
import { PageHeader, EmptyState, Spinner, StatusBadge } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';
import { UserDialog, UserDialogData } from '../components/UserDialog';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';

export default function UsersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'add' | 'edit'; user?: AppUser } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const refresh = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([api.listUsers(), api.listActivities()]);
      setUsers(u);
      setActivities(a);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDialogSave(data: UserDialogData) {
    setError(null);
    if (dialog?.mode === 'edit' && dialog.user) {
      try {
        await api.updateUser(dialog.user.id, {
          allowedActivityIds: data.allowedActivityIds,
          defaultActivityId: data.defaultActivityId,
        });
        setDialog(null);
        toast.success(t('common.saved', 'Saved'));
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    } else {
      try {
        await api.createUser({
          email: data.email,
          username: data.username,
          password: data.password,
          role: data.role,
          allowedActivityIds: data.allowedActivityIds,
          defaultActivityId: data.defaultActivityId,
        });
        setDialog(null);
        toast.success(t('common.saved', 'Saved'));
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      }
    }
  }

  async function toggleActive(u: AppUser) {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive });
      toast.success(u.isActive ? t('users.disable') : t('users.enable'));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function askDelete(u: AppUser) {
    setConfirm({
      title: t('users.delete'),
      message: `${t('users.delete')}: ${u.username} (${u.email})?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.deleteUser(u.id);
          toast.success(t('users.delete') + ': ' + u.username);
          refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  return (
    <>
      <PageHeader title={t('users.title')} actions={
        <button onClick={() => setDialog({ mode: 'add' })}>
          {t('users.add')}
        </button>
      } />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        {loading ? <Spinner /> : users.length === 0 ? (
          <EmptyState icon="👤" message={t('dashboard.noData')} />
        ) : (
          <table>
            <thead><tr>
              <th>{t('users.username')}</th>
              <th>{t('users.email')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.active')}</th>
              <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={u.isActive ? undefined : { opacity: 0.6 }}>
                  <td>
                    <a onClick={() => setDialog({ mode: 'edit', user: u })} style={{ cursor: 'pointer' }}>{u.username}</a>
                  </td>
                  <td>{u.email}</td>
                  <td><StatusBadge status={u.role} variant={u.role === 'Admin' ? 'info' : 'muted'} /></td>
                  <td>
                    <StatusBadge
                      status={u.isActive ? t('users.active') : t('users.disabled')}
                      variant={u.isActive ? 'success' : 'danger'}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-menu" ref={menuOpen === u.id ? menuRef : undefined}>
                      <button className="secondary row-menu-trigger" onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}>⋯</button>
                      {menuOpen === u.id && (
                        <div className="row-menu-panel">
                          <button className="row-menu-item" onClick={() => { setMenuOpen(null); toggleActive(u); }}>
                            {u.isActive ? t('users.disable') : t('users.enable')}
                          </button>
                          <button className="row-menu-item" onClick={() => { setMenuOpen(null); setResetUser(u); }}>
                            {t('users.resetPassword', 'Reset password')}
                          </button>
                          <button className="row-menu-item row-menu-item-danger" onClick={() => { setMenuOpen(null); askDelete(u); }}>
                            {t('users.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <UserDialog
        open={!!dialog}
        user={dialog?.mode === 'edit' ? dialog.user : null}
        activities={activities}
        existingUsers={users}
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

      <ResetPasswordDialog
        open={!!resetUser}
        username={resetUser?.username ?? ''}
        onSave={async (newPassword) => {
          if (!resetUser) return;
          await api.adminResetPassword(resetUser.id, newPassword);
          setResetUser(null);
          toast.success(t('users.resetPasswordSuccess', 'Password reset for {{username}}', { username: resetUser.username }));
        }}
        onCancel={() => setResetUser(null)}
      />
    </>
  );
}

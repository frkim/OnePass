import { useEffect, useState, FormEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Activity, AppUser } from '../api';
import { PageHeader, EmptyState, Spinner, StatusBadge } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

export default function UsersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [defaultActivity, setDefaultActivity] = useState<string>('');
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([api.listUsers(), api.listActivities()]);
      setUsers(u);
      setActivities(a);
      if (allowed.length === 0) {
        setAllowed(a.map(x => x.id));
        const def = a.find(x => x.isDefault) ?? a[0];
        if (def) setDefaultActivity(def.id);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { refresh(); }, [refresh]);

  function toggleAllowed(id: string) {
    setAllowed(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (!next.includes(defaultActivity)) setDefaultActivity(next[0] ?? '');
      return next;
    });
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (allowed.length === 0) { setError(t('users.selectAtLeastOneActivity')); return; }
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    try {
      await api.createUser({
        email: String(form.get('email') ?? ''),
        username: String(form.get('username') ?? ''),
        password: String(form.get('password') ?? ''),
        role: String(form.get('role') ?? 'User'),
        allowedActivityIds: allowed,
        defaultActivityId: defaultActivity || allowed[0],
      });
      formEl.reset();
      setAllowed(activities.map(a => a.id));
      const def = activities.find(x => x.isDefault) ?? activities[0];
      setDefaultActivity(def?.id ?? '');
      toast.success(t('common.saved', 'Saved'));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
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
      <PageHeader title={t('users.title')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={onCreate}>
        <h2>{t('users.create')}</h2>
        <div className="grid">
          <div className="field"><label>{t('users.email')}</label><input name="email" type="email" required /></div>
          <div className="field"><label>{t('users.username')}</label><input name="username" required /></div>
          <div className="field"><label>{t('users.password')}</label><input name="password" type="password" minLength={8} required /></div>
          <div className="field">
            <label>{t('users.role')}</label>
            <select name="role" defaultValue="User"><option value="Admin">Admin</option><option value="User">User</option></select>
          </div>
        </div>
        <div className="field">
          <label>{t('users.allowedActivities')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
            {activities.map(a => (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <input type="checkbox" checked={allowed.includes(a.id)} onChange={() => toggleAllowed(a.id)} style={{ width: 'auto', margin: 0 }} />
                {a.name}{a.isDefault ? ` (${t('activity.default')})` : ''}
              </label>
            ))}
            {activities.length === 0 && <small style={{ color: 'var(--muted)' }}>{t('dashboard.noData')}</small>}
          </div>
        </div>
        <div className="field">
          <label>{t('users.defaultActivity')}</label>
          <select value={defaultActivity} onChange={e => setDefaultActivity(e.target.value)}>
            {allowed.map(id => {
              const a = activities.find(x => x.id === id);
              return <option key={id} value={id}>{a?.name ?? id}</option>;
            })}
          </select>
        </div>
        <div className="form-actions">
          <button type="submit">{t('common.save')}</button>
        </div>
      </form>

      <div className="card">
        {loading ? <Spinner /> : users.length === 0 ? (
          <EmptyState icon="👤" message={t('dashboard.noData')} />
        ) : (
          <table>
            <thead><tr>
              <th>{t('users.email')}</th>
              <th>{t('users.username')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.active')}</th>
              <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={u.isActive ? undefined : { opacity: 0.6 }}>
                  <td>{u.email}</td>
                  <td>{u.username}</td>
                  <td><StatusBadge status={u.role} variant={u.role === 'Admin' ? 'info' : 'muted'} /></td>
                  <td>
                    <StatusBadge
                      status={u.isActive ? t('users.active') : t('users.disabled')}
                      variant={u.isActive ? 'success' : 'danger'}
                    />
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="secondary" onClick={() => toggleActive(u)}>
                        {u.isActive ? t('users.disable') : t('users.enable')}
                      </button>
                      <button className="danger" onClick={() => askDelete(u)}>
                        {t('users.delete')}
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

import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, AppUser } from '../api';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.listUsers().then(setUsers).catch(() => setError(t('common.error')));
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api.createUser({
        email: String(form.get('email') ?? ''),
        username: String(form.get('username') ?? ''),
        password: String(form.get('password') ?? ''),
        role: String(form.get('role') ?? 'User'),
      });
      e.currentTarget.reset();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <h1>{t('users.title')}</h1>
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
        <button type="submit">{t('common.save')}</button>
      </form>

      <div className="card">
        <table>
          <thead><tr><th>{t('users.email')}</th><th>{t('users.username')}</th><th>{t('users.role')}</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td><button className="danger" onClick={async () => { await api.deleteUser(u.id); refresh(); }}>{t('users.delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

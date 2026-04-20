import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Activity, AppUser } from '../api';

export interface UserDialogData {
  email: string;
  username: string;
  password: string;
  role: string;
  allowedActivityIds: string[];
  defaultActivityId: string;
}

interface UserDialogProps {
  open: boolean;
  /** Pass an existing user to edit, or null/undefined to create. */
  user?: AppUser | null;
  activities: Activity[];
  onSave: (data: UserDialogData) => void;
  onCancel: () => void;
}

export function UserDialog({ open, user, activities, onSave, onCancel }: UserDialogProps) {
  const { t } = useTranslation();
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [defaultAct, setDefaultAct] = useState('');

  const isEdit = !!user;

  useEffect(() => {
    if (open) {
      setError(null);
      if (user) {
        setAllowed(user.allowedActivityIds ?? activities.map(a => a.id));
        setDefaultAct(user.defaultActivityId ?? user.allowedActivityIds?.[0] ?? '');
      } else {
        setAllowed(activities.map(a => a.id));
        const def = activities.find(a => a.isDefault) ?? activities[0];
        setDefaultAct(def?.id ?? '');
      }
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [open, user, activities]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  function toggleAllowed(id: string) {
    setAllowed(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (!next.includes(defaultAct)) setDefaultAct(next[0] ?? '');
      return next;
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const role = String(form.get('role') ?? 'User');

    if (!isEdit && !email) return;
    if (allowed.length === 0) {
      setError(t('users.selectAtLeastOneActivity'));
      return;
    }

    onSave({
      email,
      username,
      password,
      role,
      allowedActivityIds: allowed,
      defaultActivityId: defaultAct || allowed[0],
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ margin: '0 0 1rem' }}>
          {isEdit ? t('users.edit', 'Edit user') : t('users.create')}
        </h2>

        {error && <div className="alert error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid">
            <div className="field">
              <label>{t('users.email')}</label>
              <input ref={emailRef} name="email" type="email" defaultValue={user?.email ?? ''} required={!isEdit} disabled={isEdit} />
            </div>
            <div className="field">
              <label>{t('users.username')}</label>
              <input name="username" defaultValue={user?.username ?? ''} required={!isEdit} disabled={isEdit} />
            </div>
            {!isEdit && (
              <div className="field">
                <label>{t('users.password')}</label>
                <input name="password" type="password" minLength={8} required />
              </div>
            )}
            <div className="field">
              <label>{t('users.role')}</label>
              <select name="role" defaultValue={user?.role ?? 'User'}>
                <option value="Admin">Admin</option>
                <option value="User">User</option>
              </select>
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
            <select value={defaultAct} onChange={e => setDefaultAct(e.target.value)}>
              {allowed.map(id => {
                const a = activities.find(x => x.id === id);
                return <option key={id} value={id}>{a?.name ?? id}</option>;
              })}
            </select>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel}>{t('common.cancel')}</button>
            <button type="submit">{t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

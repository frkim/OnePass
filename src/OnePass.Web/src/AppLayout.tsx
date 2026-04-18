import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import { useOrg } from './org';
import { api } from './api';
import { LanguageSelect } from './LanguageSelect';

export function AppLayout() {
  const { t } = useTranslation();
  const { username, role, logout, loading } = useAuth();
  const { orgs, active, switchOrg, refresh } = useOrg();
  const [eventName, setEventName] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  useEffect(() => {
    if (!username) return;
    api.getSettings().then(s => setEventName(s.eventName ?? '')).catch(() => { /* ignore */ });
  }, [username, active?.id]);

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>;
  if (!username) return <Navigate to="/login" replace />;

  async function onCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      const created = await api.createOrg(newOrgName.trim());
      // Pass the new org id explicitly so it wins over any race with the
      // initial mount-time refresh that may still be in flight.
      await refresh(created.id);
      setCreating(false);
      setNewOrgName('');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to create organisation.');
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label={t('nav.scan')}>
          <img src="/favicon.svg" alt="" />
          <span>{t('app.title')}</span>
        </NavLink>
        {active && (
          <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: '0.95rem' }} title="Active organisation">
            · {active.name}{eventName ? ` · ${eventName}` : ''}
          </span>
        )}
        <nav>
          <NavLink to="/" end>{t('nav.scan')}</NavLink>
          {role === 'Admin' && <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>}
          <NavLink to="/activities">{t('nav.activities')}</NavLink>
          {role === 'Admin' && <NavLink to="/users">{t('nav.users')}</NavLink>}
          <NavLink to="/parameters">{t('nav.parameters')}</NavLink>
        </nav>
        <div className="spacer" />
        {orgs.length > 0 && (
          <select
            aria-label="Active organisation"
            value={active?.id ?? ''}
            onChange={e => {
              if (e.target.value === '__new') { setCreating(true); return; }
              switchOrg(e.target.value);
            }}
            style={{ minWidth: '12rem' }}
          >
            {orgs.map(o => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
            <option value="__new">+ Create organisation…</option>
          </select>
        )}
        <LanguageSelect />
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{username} ({role})</span>
        <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
      </header>
      {creating && (
        <form
          onSubmit={onCreateOrg}
          style={{ padding: '1rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border, #ddd)' }}
        >
          <input
            autoFocus
            placeholder="Organisation name"
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit">Create</button>
          <button type="button" className="secondary" onClick={() => { setCreating(false); setNewOrgName(''); }}>Cancel</button>
        </form>
      )}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role !== 'Admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

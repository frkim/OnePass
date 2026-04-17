import { ReactNode } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { username, role, logout, loading } = useAuth();

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>;
  if (!username) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <span>{t('app.title')}</span>
        </div>
        <nav>
          <NavLink to="/" end>{t('nav.dashboard')}</NavLink>
          <NavLink to="/activities">{t('nav.activities')}</NavLink>
          <NavLink to="/scan">{t('nav.scan')}</NavLink>
          {role === 'Admin' && <NavLink to="/users">{t('nav.users')}</NavLink>}
        </nav>
        <div className="spacer" />
        <label htmlFor="lng" style={{ margin: 0 }}>{t('app.language')}</label>
        <select
          id="lng"
          value={i18n.resolvedLanguage}
          onChange={e => i18n.changeLanguage(e.target.value)}
          style={{ width: 'auto' }}
          aria-label={t('app.language')}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{username} ({role})</span>
        <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
      </header>
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

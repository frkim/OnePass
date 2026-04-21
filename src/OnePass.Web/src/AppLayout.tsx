import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import { useOrg } from './org';
import { api } from './api';
import { LanguageSelect } from './LanguageSelect';
import { FirstRunWizard } from './components/FirstRunWizard';
import { OrgDialog, OrgDialogData } from './components/OrgDialog';

/**
 * Top bar layout, three logical clusters:
 *   1. Brand + active-org/event chip (left)
 *   2. Primary navigation (center, wraps to a second row on narrow viewports)
 *   3. Account tools — org switcher, language, user menu (right)
 *
 * The user menu collapses Username / Role / Profile / Sign out into a
 * single dropdown so the bar stays readable on small screens and the
 * destructive "Sign out" action is no longer the most prominent control.
 */
export function AppLayout() {
  const { t } = useTranslation();
  const { username, role, logout, loading } = useAuth();
  const { orgs, active, switchOrg, refresh } = useOrg();
  const [eventName, setEventName] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  // Drives the first-run wizard: shown when an Admin signs in for the
  // first time without belonging to any organisation. The "skip"
  // affordance sets `wizardDismissed` so it does not pop again on every
  // re-render — the user can always re-open it via the org switcher's
  // "+ Create organisation…" entry.
  const [wizardDismissed, setWizardDismissed] = useState(false);
  // Manual trigger from the user menu ("Setup wizard") — lets an Admin
  // re-open the configuration wizard at any time, even after their first
  // organisation has been created, to spin up additional orgs/events.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState<string | null>(null);

  const showFirstRunWizard =
    role !== 'GlobalAdmin' && (wizardOpen ||
    (!!username && role === 'Admin' && orgs.length === 0 && !wizardDismissed));

  useEffect(() => {
    if (!username || !active?.id) { setEventName(''); return; }
    // Header subtitle now reflects the active org's first/active event so
    // every tenant sees their own context (legacy /api/settings is gone).
    api.listEvents(active.id)
      .then(list => {
        const live = list.find(e => !e.isArchived) ?? list[0];
        setEventName(live?.name ?? '');
      })
      .catch(() => { /* ignore: header subtitle is best-effort */ });
  }, [username, active?.id]);

  // Fetch the platform-wide maintenance banner (public, no auth).
  useEffect(() => {
    api.platformStatus()
      .then(s => setMaintenanceBanner(s.maintenanceMessage ?? null))
      .catch(() => { /* best-effort */ });
  }, []);

  // Close the user menu when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setUserMenuOpen(false); }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  // Close the nav menu when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!navMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) setNavMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setNavMenuOpen(false); }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [navMenuOpen]);

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>;
  if (!username) return <Navigate to="/login" replace />;

  async function onCreateOrg(data: OrgDialogData) {
    try {
      const created = await api.createOrg(data.name, data.slug || undefined, data.orgId || undefined);
      await refresh(created.id);
      setCreating(false);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to create organisation.');
    }
  }

  const initials = (username || '?').slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <div className="nav-menu" ref={navMenuRef}>
            <button
              type="button"
              className="nav-menu-trigger"
              aria-label="Navigation menu"
              aria-haspopup="menu"
              aria-expanded={navMenuOpen}
              onClick={() => setNavMenuOpen(o => !o)}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
              </svg>
            </button>
            {navMenuOpen && (
              <div className="nav-menu-panel" role="menu">
                {role === 'Admin' && <NavLink role="menuitem" to="/org/settings" onClick={() => setNavMenuOpen(false)}>{t('nav.orgSettings', 'Organisation')}</NavLink>}
                {role === 'Admin' && <NavLink role="menuitem" to="/events" onClick={() => setNavMenuOpen(false)}>{t('nav.events')}</NavLink>}
                {role === 'Admin' && <NavLink role="menuitem" to="/activities" onClick={() => setNavMenuOpen(false)}>{t('nav.activities')}</NavLink>}
                {role === 'Admin' && <NavLink role="menuitem" to="/users" onClick={() => setNavMenuOpen(false)}>{t('nav.users')}</NavLink>}
                {role !== 'GlobalAdmin' && <NavLink role="menuitem" to="/parameters" onClick={() => setNavMenuOpen(false)}>{t('nav.parameters')}</NavLink>}
                {role === 'GlobalAdmin' && <NavLink role="menuitem" to="/admin/global" onClick={() => setNavMenuOpen(false)}>{t('nav.globalAdmin', 'Global admin')}</NavLink>}
              </div>
            )}
          </div>
          <NavLink to="/" className="brand" aria-label={t('nav.scan')}>
            <img src="/favicon.svg" alt="" />
            <span>{t('app.title')}</span>
          </NavLink>
        </div>

        <nav className="app-header-nav" aria-label={t('nav.primary', 'Primary') as string}>
          {role !== 'GlobalAdmin' && <NavLink to="/" end>{t('nav.scan')}</NavLink>}
          {role !== 'GlobalAdmin' && <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>}
          {role === 'GlobalAdmin' && <NavLink to="/admin/global">{t('nav.globalAdmin', 'Global admin')}</NavLink>}
        </nav>

        <div className="app-header-right">
          {role !== 'GlobalAdmin' && orgs.length > 0 && (
            <div className="org-stack">
              {active && (
                <div className="org-chip" title={t('nav.activeOrg', 'Active organisation') as string}>
                  <span className="org-chip-name">{active.name}</span>
                  {eventName && <span className="org-chip-event">{eventName}</span>}
                </div>
              )}
              <select
                className="org-switcher"
                aria-label={t('nav.activeOrg', 'Active organisation') as string}
                value={active?.id ?? ''}
                onChange={e => {
                  if (e.target.value === '__new') { setCreating(true); return; }
                  switchOrg(e.target.value);
                }}
              >
                {orgs.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.role})
                  </option>
                ))}
                {role === 'Admin' && <option value="__new">{t('nav.createOrg', '+ Create organisation…')}</option>}
              </select>
            </div>
          )}
          <LanguageSelect />
          <div className="user-menu" ref={userMenuRef}>
            <button
              type="button"
              className="user-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen(o => !o)}
              title={`${username} (${role})`}
            >
              <span className="user-avatar" aria-hidden="true">{initials}</span>
              <span className="user-menu-name">{username}</span>
              <span className="user-menu-caret" aria-hidden="true">▾</span>
            </button>
            {userMenuOpen && (
              <div className="user-menu-panel" role="menu">
                <div className="user-menu-header">
                  <div className="user-menu-username">{username}</div>
                  <div className="user-menu-role">{role}</div>
                </div>
                <Link role="menuitem" to="/profile" className="user-menu-item" onClick={() => setUserMenuOpen(false)}>
                  {t('nav.profile', 'Profile')}
                </Link>
                <Link role="menuitem" to="/help" className="user-menu-item" onClick={() => setUserMenuOpen(false)}>
                  {t('nav.help', 'Help')}
                </Link>
                {role === 'Admin' && (
                  <button
                    role="menuitem"
                    type="button"
                    className="user-menu-item"
                    onClick={() => { setUserMenuOpen(false); setWizardOpen(true); }}
                  >
                    {t('nav.setupWizard', 'Setup wizard')}
                  </button>
                )}
                <button
                  role="menuitem"
                  type="button"
                  className="user-menu-item user-menu-item-danger"
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                >
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <OrgDialog
        open={creating}
        onSave={onCreateOrg}
        onCancel={() => setCreating(false)}
      />
      {maintenanceBanner && (
        <div className="maintenance-banner" role="status">
          <span aria-hidden="true">⚠️ </span>{maintenanceBanner}
        </div>
      )}
      <main className="app-main">
        <Outlet />
      </main>
      {showFirstRunWizard && (
        <FirstRunWizard onClose={() => { setWizardDismissed(true); setWizardOpen(false); }} />
      )}
    </div>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role === 'GlobalAdmin') return <Navigate to="/admin/global" replace />;
  if (role !== 'Admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireGlobalAdmin({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role !== 'GlobalAdmin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Redirects GlobalAdmin users away from org-level pages to the global admin dashboard. */
export function GlobalAdminRedirect({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role === 'GlobalAdmin') return <Navigate to="/admin/global" replace />;
  return <>{children}</>;
}

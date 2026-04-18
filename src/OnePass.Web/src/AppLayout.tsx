import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import { useOrg } from './org';
import { api } from './api';

// Inline SVG flags so they render consistently on every OS (Windows hides flag emojis).
function FlagGB({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 60 36" aria-hidden="true">
      <clipPath id="gb-c"><rect width="60" height="36" /></clipPath>
      <g clipPath="url(#gb-c)">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0 L60 36 M60 0 L0 36" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 L60 36 M60 0 L0 36" stroke="#C8102E" strokeWidth="3" />
        <path d="M30 0 V36 M0 18 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0 V36 M0 18 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function FlagFR({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 3 2" aria-hidden="true">
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="1" fill="#fff" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}

const LANGS: { code: string; label: string; Flag: (p: { size?: number }) => ReactElement }[] = [
  { code: 'en', label: 'English', Flag: FlagGB },
  { code: 'fr', label: 'Français', Flag: FlagFR },
];

function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = LANGS.find(l => l.code === i18n.resolvedLanguage) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(code: string) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="lang-select" ref={ref}>
      <button
        type="button"
        className="lang-select-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('app.language')}
        title={current.label}
      >
        <current.Flag />
        <span className="lang-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="lang-select-menu" role="listbox" aria-label={t('app.language')}>
          {LANGS.map(l => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === current.code}
                className={`lang-select-option${l.code === current.code ? ' active' : ''}`}
                onClick={() => pick(l.code)}
              >
                <l.Flag />
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

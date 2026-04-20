import { useState, FormEvent, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { LanguageSelect } from '../LanguageSelect';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; microsoft: boolean } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Best-effort: hide the social buttons in dev environments where the
    // OAuth client has not been configured yet. Failure here is non-fatal —
    // the password form keeps working.
    api.getProviders().then(setProviders).catch(() => setProviders({ google: false, microsoft: false }));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(emailOrUsername, password, remember);
      navigate('/');
    } catch {
      setError(t('login.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-pair">
      <div className="login-info card">
        <div className="login-info-header">
          <img src="/favicon.svg" alt="" className="login-info-logo" />
          <h1>{t('login.marketingTitle', 'Welcome to OnePass')}</h1>
        </div>
        <p>{t('login.marketingDesc', 'OnePass is the all-in-one badge scanning & activity tracking platform for in-person events. Create activities, invite your team, scan participants at the door — and get real-time analytics, CSV exports, and a fully offline-capable progressive web app.')}</p>
        <ul className="login-info-features">
          <li>{t('login.marketingFeature1', 'Real-time scan tracking & dashboards')}</li>
          <li>{t('login.marketingFeature2', 'Works offline — scans sync when back online')}</li>
          <li>{t('login.marketingFeature3', 'Multi-organisation & role-based access')}</li>
          <li>{t('login.marketingFeature4', 'CSV export & GDPR-ready data controls')}</li>
        </ul>
        <p style={{ marginTop: '1rem', marginBottom: 0 }}>
          <a href="#" className="login-learn-more" onClick={e => { e.preventDefault(); setShowHelp(true); }}>
            {t('login.learnMore', 'Learn more about OnePass →')}
          </a>
        </p>
      </div>
      <form className="card login-card" onSubmit={onSubmit} aria-label={t('login.title')}>
        <div className="login-header">
          <img src="/favicon.svg" alt="" className="login-logo" />
          <h2>{t('login.title')}</h2>
          <div style={{ flex: 1 }} />
          <LanguageSelect />
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="u">{t('login.emailOrUsername')}</label>
          <input
            id="u"
            value={emailOrUsername}
            onChange={e => setUser(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="p">{t('login.password')}</label>
          <span className="password-input">
            <input
              id="p"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              aria-pressed={showPassword}
              title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </span>
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.5rem', cursor: 'pointer', width: '100%' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            <span>{t('login.stayConnected')}</span>
          </label>
        </div>
        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        {providers?.google && (
          <>
            <div className="login-divider"><span>{t('login.orContinueWith')}</span></div>
            {/* Full-page navigation is required: the Google handler relies
                on a server-set correlation cookie and the browser must
                follow the 302 to accounts.google.com. In dev we navigate
                straight to the API origin (:5248) so the correlation
                cookie and the Google callback share the same origin —
                otherwise the Vite proxy (:5173) would scope the cookie to
                the wrong host and Google would come back with "oauth
                state was missing or invalid". */}
            <a
              className="btn-google"
              href={`${import.meta.env.DEV ? 'http://localhost:5248' : ''}/api/auth/google?returnUrl=/`}
              role="button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.34z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              <span>{t('login.continueWithGoogle')}</span>
            </a>
          </>
        )}
        {providers?.microsoft && (
          <>
            {!providers.google && (
              <div className="login-divider"><span>{t('login.orContinueWith')}</span></div>
            )}
            {/* Same dev-origin trick as Google: hit the API directly so the
                MicrosoftAccount handler's correlation cookie is scoped to
                :5248 (the callback host) rather than the Vite dev proxy. */}
            <a
              className="btn-microsoft"
              href={`${import.meta.env.DEV ? 'http://localhost:5248' : ''}/api/auth/microsoft?returnUrl=/`}
              role="button"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
                <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
                <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
                <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
              </svg>
              <span>{t('login.continueWithMicrosoft')}</span>
            </a>
          </>
        )}
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          {t('login.noAccount')} <Link to="/register">{t('login.register')}</Link>
        </p>
        </form>
      </div>

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal-card help-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{t('help.title')}</h2>
              <button type="button" className="link-button" onClick={() => setShowHelp(false)} aria-label={t('common.cancel')}>✕</button>
            </div>

            <p>{t('help.intro')}</p>

            <h3>{t('help.hierarchyTitle')}</h3>
            <pre className="help-tree" aria-label={t('help.hierarchyTitle') as string}>
{`Organisation
└── Event
    └── Activity
        ├── Participant
        └── Scan (Activity × Participant × User)`}
            </pre>

            <h3>{t('help.entitiesTitle')}</h3>

            <section className="help-entity">
              <h4>{t('help.org.title')}</h4>
              <p>{t('help.org.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.org.bullet1" /></li>
                <li><Trans i18nKey="help.org.bullet2" /></li>
                <li><Trans i18nKey="help.org.bullet3" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.event.title')}</h4>
              <p>{t('help.event.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.event.bullet1" /></li>
                <li><Trans i18nKey="help.event.bullet2" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.activity.title')}</h4>
              <p>{t('help.activity.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.activity.bullet1" /></li>
                <li><Trans i18nKey="help.activity.bullet2" /></li>
                <li><Trans i18nKey="help.activity.bullet3" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.participant.title')}</h4>
              <p>{t('help.participant.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.participant.bullet1" /></li>
                <li><Trans i18nKey="help.participant.bullet2" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.scan.title')}</h4>
              <p>{t('help.scan.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.scan.bullet1" /></li>
                <li><Trans i18nKey="help.scan.bullet2" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.user.title')}</h4>
              <p>{t('help.user.desc')}</p>
              <ul>
                <li><Trans i18nKey="help.user.role.admin" /></li>
                <li><Trans i18nKey="help.user.role.scanner" /></li>
                <li><Trans i18nKey="help.user.role.viewer" /></li>
              </ul>
            </section>

            <section className="help-entity">
              <h4>{t('help.invitation.title')}</h4>
              <p>{t('help.invitation.desc')}</p>
            </section>

            <h3>{t('help.exampleTitle')}</h3>
            <p>{t('help.exampleIntro')}</p>
            <pre className="help-tree" aria-label={t('help.exampleTitle') as string}>
{`Microsoft                          ← Organisation
└── Devoxx                         ← Event
    ├── CraneGrabberClawMachine    ← Activity (1 scan / attendee)
    ├── KeynoteCheckIn             ← Activity (1 scan / attendee)
    └── HandsOnLab                 ← Activity (3 scans max)
        ├── Alice  (badge #A-001)  ← Participant
        └── Bob    (badge #A-002)  ← Participant`}
            </pre>
            <p><Trans i18nKey="help.exampleNarrative" /></p>

            <h3>{t('help.workflowTitle')}</h3>
            <ol>
              <li><Trans i18nKey="help.workflow.step1" /></li>
              <li><Trans i18nKey="help.workflow.step2" /></li>
              <li><Trans i18nKey="help.workflow.step3" /></li>
              <li><Trans i18nKey="help.workflow.step4" /></li>
              <li><Trans i18nKey="help.workflow.step5" /></li>
              <li><Trans i18nKey="help.workflow.step6" /></li>
            </ol>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowHelp(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

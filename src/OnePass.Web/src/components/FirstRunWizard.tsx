import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useOrg } from '../org';

/**
 * First-run setup wizard shown to an Admin who has just signed in but
 * has not yet created an Organisation. Walks them through three short
 * steps (Organisation → Event → Default activity) and finally creates
 * everything in order so the rest of the app has a tenant context to
 * operate against.
 *
 * Triggered exclusively from <see cref="AppLayout"/> when
 *   role === 'Admin' && orgs.length === 0
 * and dismissed once the wizard finishes (or the user clicks "Skip" —
 * in which case they can re-open it from the org switcher).
 */

interface FirstRunWizardProps {
  onClose: () => void;
}

type Step = 1 | 2 | 3 | 4;

export function FirstRunWizard({ onClose }: FirstRunWizardProps) {
  const { t } = useTranslation();
  const { refresh } = useOrg();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — Organisation
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Step 2 — Event
  const today = new Date();
  const oneMonth = new Date(today); oneMonth.setMonth(oneMonth.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const [eventName, setEventName] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventStart, setEventStart] = useState(toLocal(today));
  const [eventEnd, setEventEnd] = useState(toLocal(oneMonth));

  // Step 3 — Default activity
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [limitScans, setLimitScans] = useState(false);
  const [maxScans, setMaxScans] = useState<number>(1);

  // Close on Escape (after warning).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function next(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (step === 1 && !orgName.trim()) return;
    if (step === 2 && !eventName.trim()) return;
    setStep((s) => (s + 1) as Step);
  }

  function prev() {
    setError(null);
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      // 1) Organisation. Slug is optional — the server derives one when
      //    blank.
      const org = await api.createOrg(
        orgName.trim(),
        orgSlug.trim() || undefined,
      );
      // Switch the active-org context up front so the activity creation
      // below (which is org-scoped via the X-Active-Org header) lands in
      // the right tenant.
      await refresh(org.id);

      // 2) Event.
      await api.createEvent(org.id, eventName.trim());
      // The newly-created event is currently used only as the org's
      // default; persisting venue/dates is an optional follow-up via
      // PATCH so a transient failure here doesn't tear down the wizard.
      // We intentionally skip those PATCH calls in the wizard for
      // simplicity — admins can edit the event from Org Settings later.

      // 3) Default activity (optional — admin can skip with empty name).
      if (activityName.trim()) {
        await api.createActivity({
          name: activityName.trim(),
          description: activityDescription.trim() || undefined,
          startsAt: new Date(eventStart).toISOString(),
          endsAt: new Date(eventEnd).toISOString(),
          maxScansPerParticipant: limitScans ? Math.max(1, maxScans) : -1,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const titleKey =
    step === 1 ? 'wizard.step1.title'
    : step === 2 ? 'wizard.step2.title'
    : step === 3 ? 'wizard.step3.title'
    : 'wizard.step4.title';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="wizard-title">{t('wizard.title')}</h2>
          <p className="modal-subtitle">{t(titleKey)}</p>
          <ol className="wizard-steps" aria-label={t('wizard.progress') as string}>
            {[1, 2, 3, 4].map((n) => (
              <li
                key={n}
                className={
                  n === step ? 'active' : n < step ? 'done' : ''
                }
                aria-current={n === step ? 'step' : undefined}
              >
                {n}
              </li>
            ))}
          </ol>
        </header>

        {error && <div className="alert error" role="alert">{error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); if (step === 4) finish(); else next(); }}>
          {step === 1 && (
            <>
              <p className="modal-lead">{t('wizard.step1.lead')}</p>
              <div className="field">
                <label htmlFor="w-org-name">{t('wizard.org.name')}</label>
                <input
                  id="w-org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  autoFocus
                  maxLength={120}
                  placeholder={t('wizard.org.namePlaceholder') as string}
                />
              </div>
              <div className="field">
                <label htmlFor="w-org-slug">{t('wizard.org.slug')}</label>
                <input
                  id="w-org-slug"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  maxLength={64}
                  placeholder={t('wizard.org.slugPlaceholder') as string}
                />
                <small className="field-hint">{t('wizard.org.slugHint')}</small>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="modal-lead">{t('wizard.step2.lead')}</p>
              <div className="field">
                <label htmlFor="w-event-name">{t('wizard.event.name')}</label>
                <input
                  id="w-event-name"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  required
                  autoFocus
                  maxLength={120}
                  placeholder={t('wizard.event.namePlaceholder') as string}
                />
              </div>
              <div className="field">
                <label htmlFor="w-event-venue">{t('wizard.event.venue')}</label>
                <input
                  id="w-event-venue"
                  value={eventVenue}
                  onChange={(e) => setEventVenue(e.target.value)}
                  maxLength={200}
                  placeholder={t('wizard.event.venuePlaceholder') as string}
                />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="w-event-start">{t('wizard.event.startsAt')}</label>
                  <input
                    id="w-event-start"
                    type="datetime-local"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="w-event-end">{t('wizard.event.endsAt')}</label>
                  <input
                    id="w-event-end"
                    type="datetime-local"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="modal-lead">{t('wizard.step3.lead')}</p>
              <div className="field">
                <label htmlFor="w-act-name">{t('wizard.activity.name')}</label>
                <input
                  id="w-act-name"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  autoFocus
                  maxLength={120}
                  placeholder={t('wizard.activity.namePlaceholder') as string}
                />
                <small className="field-hint">{t('wizard.activity.optional')}</small>
              </div>
              <div className="field">
                <label htmlFor="w-act-desc">{t('wizard.activity.description')}</label>
                <input
                  id="w-act-desc"
                  value={activityDescription}
                  onChange={(e) => setActivityDescription(e.target.value)}
                  maxLength={400}
                />
              </div>
              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={limitScans}
                      onChange={(e) => setLimitScans(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    {t('activity.limitMaxScans')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxScans}
                    onChange={(e) => setMaxScans(Number(e.target.value) || 1)}
                    disabled={!limitScans}
                    aria-label={t('activity.maxScans') as string}
                    style={{ width: '6rem', marginLeft: '0.25rem' }}
                  />
                  {!limitScans && (
                    <small style={{ color: 'var(--muted)' }}>{t('activity.unlimited')}</small>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="modal-lead">{t('wizard.step4.lead')}</p>
              <dl className="wizard-summary">
                <dt>{t('wizard.org.name')}</dt>
                <dd>{orgName || <em>{t('wizard.summary.missing')}</em>}</dd>
                {orgSlug && (<><dt>{t('wizard.org.slug')}</dt><dd>{orgSlug}</dd></>)}

                <dt>{t('wizard.event.name')}</dt>
                <dd>{eventName || <em>{t('wizard.summary.missing')}</em>}</dd>
                {eventVenue && (<><dt>{t('wizard.event.venue')}</dt><dd>{eventVenue}</dd></>)}

                <dt>{t('wizard.activity.name')}</dt>
                <dd>
                  {activityName || <em>{t('wizard.summary.skipped')}</em>}
                </dd>
                {activityName && (
                  <>
                    <dt>{t('activity.maxScans')}</dt>
                    <dd>{limitScans ? maxScans : t('activity.unlimited')}</dd>
                  </>
                )}
              </dl>
            </>
          )}

          <footer className="modal-footer">
            <button
              type="button"
              className="link-button"
              onClick={onClose}
              disabled={busy}
            >
              {t('wizard.skip')}
            </button>
            <div style={{ flex: 1 }} />
            {step > 1 && (
              <button type="button" onClick={prev} disabled={busy}>
                {t('wizard.back')}
              </button>
            )}
            {step < 4 && (
              <button type="submit" disabled={busy}>{t('wizard.next')}</button>
            )}
            {step === 4 && (
              <button type="submit" disabled={busy || !orgName.trim() || !eventName.trim()}>
                {busy ? t('common.loading') : t('wizard.finish')}
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Activity, EventInfo } from '../api';

export interface ActivityDialogData {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  limitMaxScans: boolean;
  maxScansPerParticipant: number;
  eventId: string;
}

interface ActivityDialogProps {
  open: boolean;
  /** Pass an existing activity to edit, or null/undefined to create. */
  activity?: Activity | null;
  existingNames: string[];
  events: EventInfo[];
  onSave: (data: ActivityDialogData) => void;
  onCancel: () => void;
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityDialog({ open, activity, existingNames, events, onSave, onCancel }: ActivityDialogProps) {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitScans, setLimitScans] = useState(false);

  const isEdit = !!activity;

  // Default values for create mode
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultName = `activity_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const defaultEnd = `${oneMonthLater.getFullYear()}-${pad(oneMonthLater.getMonth() + 1)}-${pad(oneMonthLater.getDate())}T${pad(oneMonthLater.getHours())}:${pad(oneMonthLater.getMinutes())}`;

  useEffect(() => {
    if (open) {
      setError(null);
      if (activity) {
        setLimitScans(activity.maxScansPerParticipant > 0);
      } else {
        setLimitScans(false);
      }
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, activity]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;

    const eventId = String(form.get('eventId') ?? '').trim();
    if (!isEdit && !eventId) {
      setError(t('activity.eventRequired'));
      return;
    }

    // Check duplicate names (exclude current activity when editing)
    const isDuplicate = existingNames.some(
      n => n.toLowerCase() === name.toLowerCase() && (!activity || activity.name.toLowerCase() !== name.toLowerCase())
    );
    if (isDuplicate) {
      setError(t('activity.duplicateName'));
      return;
    }

    onSave({
      name,
      description: String(form.get('description') ?? ''),
      startsAt: new Date(String(form.get('startsAt'))).toISOString(),
      endsAt: new Date(String(form.get('endsAt'))).toISOString(),
      limitMaxScans: limitScans,
      maxScansPerParticipant: limitScans ? Number(form.get('maxScans') || 1) : -1,
      eventId,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ margin: '0 0 1rem' }}>
          {isEdit ? t('activity.edit') : t('activity.create')}
        </h2>

        {error && <div className="alert error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid">
            {!isEdit && (
              <div className="field">
                <label>{t('activity.event')}</label>
                <select name="eventId" required defaultValue="">
                  <option value="" disabled>{t('activity.selectEvent')}</option>
                  {events.filter(ev => !ev.isArchived).map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>{t('activity.name')}</label>
              <input
                ref={nameRef}
                name="name"
                defaultValue={isEdit ? activity!.name : defaultName}
                required
              />
            </div>
            <div className="field">
              <label>{t('activity.description')}</label>
              <input
                name="description"
                defaultValue={isEdit ? (activity!.description ?? '') : ''}
              />
            </div>
            <div className="field">
              <label>{t('activity.startsAt')}</label>
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={isEdit ? toLocalDatetime(activity!.startsAt) : defaultStart}
                required
              />
            </div>
            <div className="field">
              <label>{t('activity.endsAt')}</label>
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={isEdit ? toLocalDatetime(activity!.endsAt) : defaultEnd}
                required
              />
            </div>
            <div className="field">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={limitScans}
                    onChange={e => setLimitScans(e.target.checked)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  {t('activity.limitMaxScans')}
                </label>
                <input
                  name="maxScans"
                  type="number"
                  min={1}
                  defaultValue={isEdit && activity!.maxScansPerParticipant > 0 ? activity!.maxScansPerParticipant : 100}
                  aria-label={t('activity.maxScans')}
                  style={{ width: '6rem', marginLeft: '0.25rem', display: limitScans ? undefined : 'none' }}
                />
                {!limitScans && <small style={{ color: 'var(--muted)' }}>{t('activity.unlimited')}</small>}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit">
              {isEdit ? t('common.save') : t('activity.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

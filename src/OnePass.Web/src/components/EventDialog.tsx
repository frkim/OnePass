import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventInfo } from '../api';

export interface EventDialogData {
  name: string;
  slug: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
}

interface EventDialogProps {
  open: boolean;
  event?: EventInfo | null;
  existingNames: string[];
  onSave: (data: EventDialogData) => void;
  onCancel: () => void;
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Mirror the backend NormaliseSlug: lowercase, non-alphanum → dash, trim dashes. */
function normaliseSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function EventDialog({ open, event, existingNames, onSave, onCancel }: EventDialogProps) {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const isEdit = !!event;

  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const defaultEnd = `${oneMonthLater.getFullYear()}-${pad(oneMonthLater.getMonth() + 1)}-${pad(oneMonthLater.getDate())}T${pad(oneMonthLater.getHours())}:${pad(oneMonthLater.getMinutes())}`;

  useEffect(() => {
    if (open) {
      setError(null);
      setSlug(event?.slug ?? '');
      setSlugTouched(!!event);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, event]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
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

    const isDuplicate = existingNames.some(
      n => n.toLowerCase() === name.toLowerCase() && (!event || event.name.toLowerCase() !== name.toLowerCase()),
    );
    if (isDuplicate) {
      setError(t('event.duplicateName'));
      return;
    }

    onSave({
      name,
      slug: String(form.get('slug') ?? '').trim(),
      description: String(form.get('description') ?? ''),
      venue: String(form.get('venue') ?? ''),
      startsAt: form.get('startsAt') ? new Date(String(form.get('startsAt'))).toISOString() : '',
      endsAt: form.get('endsAt') ? new Date(String(form.get('endsAt'))).toISOString() : '',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ margin: '0 0 1rem' }}>
          {isEdit ? t('event.edit') : t('event.create')}
        </h2>

        {error && <div className="alert error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid">
            <div className="field">
              <label>{t('event.name')}</label>
              <input
                ref={nameRef}
                name="name"
                defaultValue={isEdit ? event!.name : ''}
                required
                autoComplete="off"
                onChange={e => { if (!slugTouched) setSlug(normaliseSlug(e.target.value)); }}
              />
            </div>
            {!isEdit && (
              <div className="field">
                <label>{t('event.slug')}</label>
                <input
                  name="slug"
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(normaliseSlug(e.target.value)); }}
                  autoComplete="off"
                  placeholder={t('event.slugHint') as string}
                />
              </div>
            )}
            <div className="field">
              <label>{t('event.description')}</label>
              <input
                name="description"
                defaultValue={isEdit ? (event!.description ?? '') : ''}
              />
            </div>
            <div className="field">
              <label>{t('event.venue')}</label>
              <input
                name="venue"
                defaultValue={isEdit ? (event!.venue ?? '') : ''}
              />
            </div>
            <div className="field">
              <label>{t('event.startsAt')}</label>
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={isEdit && event!.startsAt ? toLocalDatetime(event!.startsAt) : defaultStart}
              />
            </div>
            <div className="field">
              <label>{t('event.endsAt')}</label>
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={isEdit && event!.endsAt ? toLocalDatetime(event!.endsAt) : defaultEnd}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit">
              {isEdit ? t('common.save') : t('event.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

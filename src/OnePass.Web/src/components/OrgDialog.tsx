import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface OrgDialogData {
  name: string;
  slug: string;
}

interface OrgDialogProps {
  open: boolean;
  onSave: (data: OrgDialogData) => void;
  onCancel: () => void;
}

export function OrgDialog({ open, onSave, onCancel }: OrgDialogProps) {
  const { t } = useTranslation();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  /** Mirror the backend NormaliseSlug: lowercase, non-alphanum → dash, trim dashes. */
  function normaliseSlug(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  useEffect(() => {
    if (open) {
      setError(null);
      setSlug('');
      setSlugTouched(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

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
    const slug = String(form.get('slug') ?? '').trim();
    onSave({ name, slug });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ margin: '0 0 1rem' }}>
          {t('nav.createOrg', 'Create organisation')}
        </h2>

        {error && <div className="alert error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('nav.newOrgPlaceholder', 'Organisation name')}</label>
            <input
              ref={nameRef}
              name="name"
              required
              autoComplete="off"
              onChange={e => { if (!slugTouched) setSlug(normaliseSlug(e.target.value)); }}
            />
          </div>
          <div className="field">
            <label>{t('wizard.org.slug', 'URL slug (optional)')}</label>
            <input
              name="slug"
              value={slug}
              onChange={e => { setSlugTouched(true); setSlug(normaliseSlug(e.target.value)); }}
              placeholder={t('wizard.org.slugPlaceholder', 'e.g. microsoft') as string}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <small style={{ color: 'var(--muted)' }}>{t('wizard.org.slugHint', 'Lower-case, dashes only. Leave blank to derive it from the name.')}</small>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel}>{t('common.cancel')}</button>
            <button type="submit">{t('common.create', 'Create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

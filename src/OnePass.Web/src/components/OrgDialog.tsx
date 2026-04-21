import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface OrgDialogData {
  name: string;
  orgId: string;
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
  const [orgId, setOrgId] = useState('');
  const [orgIdTouched, setOrgIdTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  /** Mirror the backend NormaliseSlug: lowercase, non-alphanum → dash, trim dashes. */
  function normaliseSlug(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /** Mirror the backend NormaliseOrgId: lowercase, non-alphanum → underscore, max 16 chars. */
  function normaliseOrgId(raw: string): string {
    let s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (s.length > 16) s = s.slice(0, 16).replace(/_+$/, '');
    return s;
  }

  useEffect(() => {
    if (open) {
      setError(null);
      setOrgId('');
      setOrgIdTouched(false);
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
    const orgId = String(form.get('orgId') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();
    onSave({ name, orgId, slug });
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
              onChange={e => {
                const derived = normaliseOrgId(e.target.value);
                if (!orgIdTouched) setOrgId(derived);
                if (!slugTouched) setSlug(normaliseSlug(orgIdTouched ? orgId : derived));
              }}
            />
          </div>
          <div className="field">
            <label>{t('wizard.org.orgId', 'Organisation ID')}</label>
            <input
              name="orgId"
              value={orgId}
              onChange={e => {
                setOrgIdTouched(true);
                const v = normaliseOrgId(e.target.value);
                setOrgId(v);
                if (!slugTouched) setSlug(normaliseSlug(v));
              }}
              maxLength={16}
              placeholder={t('wizard.org.orgIdPlaceholder', 'e.g. microsoft') as string}
              pattern="[a-z0-9]+([_-][a-z0-9]+)*"
            />
            <small style={{ color: 'var(--muted)' }}>{t('wizard.org.orgIdHint', 'Max 16 chars, lowercase, digits, underscores and dashes only.')}</small>
          </div>
          <div className="field">
            <label>{t('wizard.org.slug', 'URL slug')}</label>
            <input
              name="slug"
              value={slug}
              onChange={e => { setSlugTouched(true); setSlug(normaliseSlug(e.target.value)); }}
              placeholder={t('wizard.org.slugPlaceholder', 'e.g. microsoft') as string}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <small style={{ color: 'var(--muted)' }}>{t('wizard.org.slugHint', 'Auto-filled from Organisation ID. Lower-case, dashes only.')}</small>
            <small className="field-tip" style={{ display: 'block', marginTop: '0.25rem', color: 'var(--muted)', fontStyle: 'italic' }} dangerouslySetInnerHTML={{ __html: t('wizard.org.slugTip', 'The slug appears in all public URLs for your organisation, e.g. https://onepass.app/<strong>microsoft</strong>/events.') }} />
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

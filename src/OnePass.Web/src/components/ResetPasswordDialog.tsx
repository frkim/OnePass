import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ResetPasswordDialogProps {
  open: boolean;
  username: string;
  onSave: (newPassword: string) => Promise<void>;
  onCancel: () => void;
}

export function ResetPasswordDialog({ open, username, onSave, onCancel }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const valid = hasLength && hasUpper && hasSpecial;

  useEffect(() => {
    if (open) {
      setPassword('');
      setShow(false);
      setError(null);
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3>{t('users.resetPassword', 'Reset password')}</h3>
        <p style={{ margin: '0.5rem 0 1rem', opacity: 0.8 }}>
          {t('users.resetPasswordFor', 'Set a new password for {{username}}.', { username })}
        </p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('users.newPassword', 'New password')}</label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="secondary"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                onClick={() => setShow(!show)}
              >{show ? '🙈' : '👁'}</button>
            </div>
            <ul className="password-rules" style={{ fontSize: '0.85rem', margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              <li style={{ color: hasLength ? 'var(--success)' : undefined }}>{t('register.passwordMinLength', 'At least 8 characters')}</li>
              <li style={{ color: hasUpper ? 'var(--success)' : undefined }}>{t('register.passwordUppercase', 'At least one uppercase letter')}</li>
              <li style={{ color: hasSpecial ? 'var(--success)' : undefined }}>{t('register.passwordSpecial', 'At least one special character')}</li>
            </ul>
          </div>
          <div className="confirm-dialog-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!valid || saving}>
              {saving ? t('common.saving', 'Saving…') : t('users.resetPassword', 'Reset password')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

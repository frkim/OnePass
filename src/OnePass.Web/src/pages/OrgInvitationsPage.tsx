import { FormEvent, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Invitation } from '../api';
import { useOrg } from '../org';
import { PageHeader, EmptyState, Spinner, StatusBadge } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

const ROLES = ['OrgAdmin', 'EventCoordinator', 'Scanner', 'Viewer'] as const;

export default function OrgInvitationsPage() {
  const { t } = useTranslation();
  const { active } = useOrg();
  const toast = useToast();
  const [rows, setRows] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof ROLES[number]>('Scanner');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!active?.id) return;
    try {
      setRows(await api.listInvitations(active.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [active?.id, t]);

  useEffect(() => { reload(); }, [reload]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!active?.id || !email.trim()) return;
    setError(null);
    try {
      const inv = await api.createInvitation(active.id, email.trim(), role);
      const url = `${window.location.origin}/invitations/accept?token=${encodeURIComponent(inv.token)}`;
      toast.success(t('invitations.created', 'Invitation created. Share this link: ') + url);
      setEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function askRevoke(inv: Invitation) {
    setConfirm({
      title: t('invitations.revoke', 'Revoke'),
      message: `${t('invitations.revoke', 'Revoke')}: ${inv.email}?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        if (!active?.id) return;
        try {
          await api.revokeInvitation(active.id, inv.token);
          toast.success(t('invitations.revoke', 'Revoke') + ': ' + inv.email);
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  return (
    <>
      <PageHeader title={t('invitations.title', 'Invitations')} />
      <ToastContainer toasts={toast.toasts} />
      {error && <div className="alert error">{error}</div>}

      <form className="card" onSubmit={onInvite}>
        <h2>{t('invitations.send', 'Create invitation')}</h2>
        <div className="grid">
          <div className="field">
            <label>{t('invitations.email', 'Email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t('invitations.role', 'Role')}</label>
            <select value={role} onChange={e => setRole(e.target.value as typeof ROLES[number])}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit">{t('invitations.send', 'Create invitation')}</button>
        </div>
      </form>

      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="✉️" message={t('invitations.empty', 'No invitations yet.')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('invitations.email', 'Email')}</th>
                <th>{t('invitations.role', 'Role')}</th>
                <th>{t('invitations.expires', 'Expires')}</th>
                <th>{t('invitations.accepted', 'Accepted')}</th>
                <th style={{ textAlign: 'right' }}>{t('participants.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const accepted = !!r.acceptedAt;
                return (
                  <tr key={r.token}>
                    <td>{r.email}</td>
                    <td><StatusBadge status={r.role} variant="muted" /></td>
                    <td>{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '\u2014'}</td>
                    <td>
                      {accepted
                        ? <StatusBadge status={new Date(r.acceptedAt!).toLocaleDateString()} variant="success" />
                        : <span style={{ color: 'var(--muted)' }}>{'\u2014'}</span>
                      }
                    </td>
                    <td>
                      <div className="actions-cell">
                        {!accepted && (
                          <button className="danger" onClick={() => askRevoke(r)}>
                            {t('invitations.revoke', 'Revoke')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        variant={confirm?.variant}
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

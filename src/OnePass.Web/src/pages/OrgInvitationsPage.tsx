import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Invitation } from '../api';
import { useOrg } from '../org';

const ROLES = ['OrgAdmin', 'EventCoordinator', 'Scanner', 'Viewer'] as const;

/**
 * Outstanding + revoked invitations for the active org. Sending a new
 * invitation produces a tokenised acceptance URL the org admin can copy
 * into an email; OnePass intentionally does not yet send emails itself
 * (Phase 6 — pending an SMTP integration decision).
 */
export default function OrgInvitationsPage() {
  const { t } = useTranslation();
  const { active } = useOrg();
  const [rows, setRows] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof ROLES[number]>('Scanner');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function reload() {
    if (!active?.id) return;
    try { setRows(await api.listInvitations(active.id)); }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active?.id]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!active?.id || !email.trim()) return;
    setError(null); setInfo(null);
    try {
      const inv = await api.createInvitation(active.id, email.trim(), role);
      const url = `${window.location.origin}/invitations/accept?token=${encodeURIComponent(inv.token)}`;
      setInfo(t('invitations.created', 'Invitation created. Share this link: ') + url);
      setEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onRevoke(inv: Invitation) {
    if (!active?.id) return;
    try { await api.revokeInvitation(active.id, inv.token); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  }

  return (
    <>
      <h1>{t('invitations.title', 'Invitations')}</h1>
      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}

      <form className="card" onSubmit={onInvite}>
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
        <button type="submit">{t('invitations.send', 'Create invitation')}</button>
      </form>

      <table className="data">
        <thead>
          <tr>
            <th>{t('invitations.email', 'Email')}</th>
            <th>{t('invitations.role', 'Role')}</th>
            <th>{t('invitations.expires', 'Expires')}</th>
            <th>{t('invitations.accepted', 'Accepted')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const accepted = !!r.acceptedAt;
            return (
              <tr key={r.token}>
                <td>{r.email}</td>
                <td>{r.role}</td>
                <td>{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '\u2014'}</td>
                <td>{accepted ? new Date(r.acceptedAt!).toLocaleDateString() : '\u2014'}</td>
                <td>{!accepted && <button type="button" onClick={() => onRevoke(r)}>{t('invitations.revoke', 'Revoke')}</button>}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>{t('invitations.empty', 'No invitations yet.')}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Membership } from '../api';
import { useOrg } from '../org';

const ROLES = ['OrgOwner', 'OrgAdmin', 'EventCoordinator', 'Scanner', 'Viewer'] as const;

/**
 * Members + their org-roles for the active organisation. Last-owner removal
 * is enforced server-side; we surface the resulting 409 inline.
 */
export default function OrgMembersPage() {
  const { t } = useTranslation();
  const { active } = useOrg();
  const [rows, setRows] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!active?.id) return;
    try { setRows(await api.listMemberships(active.id)); }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active?.id]);

  async function onChangeRole(m: Membership, role: string) {
    if (!active?.id) return;
    try {
      await api.updateMembership(active.id, m.userId, { role });
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  }

  async function onRemove(m: Membership) {
    if (!active?.id) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('members.confirmRemove', 'Remove this member from the organisation?'))) return;
    try {
      await api.removeMembership(active.id, m.userId);
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
  }

  return (
    <>
      <h1>{t('members.title', 'Members')}</h1>
      {error && <div className="alert error">{error}</div>}
      <table className="data">
        <thead>
          <tr>
            <th>{t('members.user', 'User')}</th>
            <th>{t('members.role', 'Role')}</th>
            <th>{t('members.status', 'Status')}</th>
            <th>{t('members.joinedAt', 'Joined')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.userId}>
              <td>{m.userId}</td>
              <td>
                <select value={m.role} onChange={e => onChangeRole(m, e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>{m.status}</td>
              <td>{new Date(m.joinedAt).toLocaleDateString()}</td>
              <td><button type="button" onClick={() => onRemove(m)}>{t('common.remove', 'Remove')}</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>{t('members.empty', 'No members yet.')}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

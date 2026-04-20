import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  GlobalAdminOrg,
  GlobalAdminStats,
  PlatformSettings,
} from '../api';
import { PageHeader, Spinner, EmptyState, StatusBadge } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast, ToastContainer } from '../components/Toast';

/**
 * Global ("PlatformAdmin") settings page. Only the legacy global Admin
 * role can land here — protection is enforced at three levels:
 *   1. <RequireGlobalAdmin> wrapper in main.tsx (route guard)
 *   2. The nav link is conditional on role === 'Admin' in AppLayout
 *   3. The API gates every endpoint via TenantPolicies.PlatformAdmin
 */
export default function GlobalAdminPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [stats, setStats] = useState<GlobalAdminStats | null>(null);
  const [orgs, setOrgs] = useState<GlobalAdminOrg[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string; message: string; variant?: 'danger' | 'default'; onConfirm: () => void;
  } | null>(null);

  async function load() {
    setError(null);
    try {
      const [s, o, p] = await Promise.all([
        api.globalAdmin.stats(),
        api.globalAdmin.listOrgs(),
        api.globalAdmin.getSettings(),
      ]);
      setStats(s);
      setOrgs(o);
      setSettings(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => { void load(); }, []);

  async function onSetStatus(orgId: string, status: 'Active' | 'Suspended') {
    setConfirm({
      title: status === 'Suspended' ? t('globalAdmin.suspend') : t('globalAdmin.reactivate'),
      message: t('globalAdmin.confirmStatus', { status }),
      variant: status === 'Suspended' ? 'danger' : 'default',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.globalAdmin.setOrgStatus(orgId, status);
          setOrgs(prev => prev.map(o => (o.id === orgId ? { ...o, status } : o)));
          toast.success(t('common.saved', 'Saved'));
        } catch (err) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      },
    });
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.globalAdmin.updateSettings({
        registrationOpen: settings.registrationOpen,
        maintenanceMessage: settings.maintenanceMessage ?? '',
        defaultRetentionDays: settings.defaultRetentionDays,
        defaultOrgLimits: settings.defaultOrgLimits,
      });
      setSettings(updated);
      toast.success(t('common.saved', 'Saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  function patchSettings(patch: Partial<PlatformSettings>) {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
  }

  function patchLimits(patch: Partial<PlatformSettings['defaultOrgLimits']>) {
    if (!settings) return;
    setSettings({ ...settings, defaultOrgLimits: { ...settings.defaultOrgLimits, ...patch } });
  }

  return (
    <>
      <PageHeader title={t('globalAdmin.title')} description={t('globalAdmin.subtitle')} />
      <ToastContainer toasts={toast.toasts} />

      {error && <div className="alert error" role="alert"><span aria-hidden="true">⛔ </span>{error}</div>}

      {/* ---- Stats summary ---- */}
      <section className="card">
        <h2>{t('globalAdmin.statsTitle')}</h2>
        {!stats ? (
          <Spinner />
        ) : (
          <div className="admin-stats">
            <StatBox label={t('globalAdmin.orgsTotal')} value={stats.orgs.total} />
            <StatBox label={t('globalAdmin.orgsActive')} value={stats.orgs.active} tone="ok" />
            <StatBox label={t('globalAdmin.orgsSuspended')} value={stats.orgs.suspended} tone="warn" />
            <StatBox label={t('globalAdmin.usersTotal')} value={stats.users.total} />
            <StatBox label={t('globalAdmin.usersLocked')} value={stats.users.locked} tone="warn" />
            <StatBox label={t('globalAdmin.usersAdmins')} value={stats.users.admins} tone="info" />
          </div>
        )}
      </section>

      {/* ---- Platform settings ---- */}
      <section className="card">
        <h2>{t('globalAdmin.settingsTitle')}</h2>
        {!settings ? (
          <Spinner />
        ) : (
          <form onSubmit={onSaveSettings} className="admin-settings-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.registrationOpen}
                onChange={e => patchSettings({ registrationOpen: e.target.checked })}
              />
              <span>{t('globalAdmin.registrationOpen')}</span>
            </label>
            <label>
              <span>{t('globalAdmin.maintenanceMessage')}</span>
              <textarea
                rows={2}
                value={settings.maintenanceMessage ?? ''}
                onChange={e => patchSettings({ maintenanceMessage: e.target.value })}
                placeholder={t('globalAdmin.maintenancePlaceholder') as string}
              />
            </label>
            <label>
              <span>{t('globalAdmin.defaultRetentionDays')}</span>
              <input
                type="number"
                min={0}
                value={settings.defaultRetentionDays}
                onChange={e => patchSettings({ defaultRetentionDays: Number(e.target.value) })}
                style={{ maxWidth: 140 }}
              />
            </label>
            <fieldset className="admin-limits">
              <legend>{t('globalAdmin.defaultLimits')}</legend>
              <label>
                <span>{t('globalAdmin.maxEvents')}</span>
                <input
                  type="number"
                  min={1}
                  value={settings.defaultOrgLimits.maxEvents}
                  onChange={e => patchLimits({ maxEvents: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>{t('globalAdmin.maxMembers')}</span>
                <input
                  type="number"
                  min={1}
                  value={settings.defaultOrgLimits.maxMembers}
                  onChange={e => patchLimits({ maxMembers: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>{t('globalAdmin.maxScansPerMonth')}</span>
                <input
                  type="number"
                  min={1}
                  value={settings.defaultOrgLimits.maxScansPerMonth}
                  onChange={e => patchLimits({ maxScansPerMonth: Number(e.target.value) })}
                />
              </label>
            </fieldset>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {busy ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ---- Org listing + suspend ---- */}
      <section className="card">
        <h2>{t('globalAdmin.orgsTitle')}</h2>
        {orgs.length === 0 ? (
          <EmptyState icon="🏢" message={t('globalAdmin.orgsNone')} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('globalAdmin.colName')}</th>
                <th>{t('globalAdmin.colSlug')}</th>
                <th>{t('globalAdmin.colStatus')}</th>
                <th>{t('globalAdmin.colPlan')}</th>
                <th>{t('globalAdmin.colMembers')}</th>
                <th>{t('globalAdmin.colCreated')}</th>
                <th>{t('globalAdmin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td><code>{o.slug}</code></td>
                  <td>
                    <StatusBadge status={o.status} variant={o.status === 'Active' ? 'success' : 'danger'} />
                  </td>
                  <td>{o.plan}</td>
                  <td>{o.memberCount}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="actions-cell">
                    {o.status === 'Active' ? (
                      <button type="button" className="danger" onClick={() => onSetStatus(o.id, 'Suspended')}>
                        {t('globalAdmin.suspend')}
                      </button>
                    ) : o.status === 'Suspended' ? (
                      <button type="button" onClick={() => onSetStatus(o.id, 'Active')}>
                        {t('globalAdmin.reactivate')}
                      </button>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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

function StatBox({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'info' }) {
  return (
    <div className={`stat-box stat-${tone ?? 'neutral'}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

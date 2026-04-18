import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, getActiveOrgId, setActiveOrgId, OrgSummary } from './api';
import { useAuth } from './auth';

interface OrgContextValue {
  /** All orgs the current user belongs to. */
  orgs: OrgSummary[];
  /** The currently active org (the one whose id is sent on every API call). */
  active: OrgSummary | null;
  loading: boolean;
  /** Switch the active org and persist the choice. Triggers a refetch of org-scoped data. */
  switchOrg: (orgId: string) => Promise<void>;
  /** Re-fetch the user's orgs (call after creating one).
   * Optional `preferredOrgId` is used as the active org if it appears in the
   * fresh list — useful right after creating a new org to switch to it
   * deterministically without racing the persisted localStorage value. */
  refresh: (preferredOrgId?: string) => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [active, setActive] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (preferredOrgId?: string) => {
    if (!userId) {
      setOrgs([]);
      setActive(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.listMyOrgs();
      setOrgs(list);
      const persisted = preferredOrgId ?? getActiveOrgId();
      const next = list.find(o => o.id === persisted) ?? list[0] ?? null;
      setActive(next);
      setActiveOrgId(next?.id ?? null);
    } catch {
      setOrgs([]);
      setActive(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const switchOrg = useCallback(async (orgId: string) => {
    const next = orgs.find(o => o.id === orgId);
    if (!next) return;
    setActiveOrgId(orgId);
    setActive(next);
    // Best-effort server-side persistence (User.DefaultOrgId). Failure is non-fatal —
    // the choice is already persisted in localStorage.
    try { await api.switchActiveOrg(orgId); } catch { /* ignore */ }
  }, [orgs]);

  const value = useMemo<OrgContextValue>(
    () => ({ orgs, active, loading, switchOrg, refresh }),
    [orgs, active, loading, switchOrg, refresh],
  );
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

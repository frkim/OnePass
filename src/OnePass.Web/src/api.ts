const TOKEN_KEY = 'onepass.token';
const ORG_KEY = 'onepass.activeOrg';
const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null, remember = true) {
  // Always clear from both stores so callers don't end up with stale tokens.
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (t) {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
  }
}

/** Active organisation id sent on every API call as the X-OnePass-Org header. */
export function getActiveOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}
export function setActiveOrgId(orgId: string | null) {
  if (orgId) localStorage.setItem(ORG_KEY, orgId);
  else localStorage.removeItem(ORG_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const tok = getToken();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const orgId = getActiveOrgId();
  if (orgId) headers.set('X-OnePass-Org', orgId);
  const resp = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (resp.status === 401) {
    setToken(null);
    throw new Error('unauthorized');
  }
  if (!resp.ok) {
    const text = await resp.text();
    let code: string | undefined;
    let message = text;
    let previousScannedAt: string | undefined;
    try {
      const body = JSON.parse(text);
      if (body && typeof body === 'object') {
        if (typeof body.code === 'string') code = body.code;
        if (typeof body.error === 'string') message = body.error;
        if (typeof body.previousScannedAt === 'string') previousScannedAt = body.previousScannedAt;
      }
    } catch { /* not JSON */ }
    const err = new Error(message || `Request failed: ${resp.status}`) as Error & {
      code?: string;
      status?: number;
      previousScannedAt?: string;
    };
    err.code = code;
    err.status = resp.status;
    err.previousScannedAt = previousScannedAt;
    throw err;
  }
  if (resp.status === 204) return undefined as unknown as T;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await resp.json()) as T;
  return (await resp.text()) as unknown as T;
}

export interface LoginResponse {
  token: string;
  userId: string;
  username: string;
  role: string;
  expiresInMinutes: number;
}

export interface Activity {
  id: string;
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  maxScansPerParticipant: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface Participant {
  id: string;
  activityId: string;
  displayName: string;
  email?: string | null;
}

export interface Scan {
  id: string;
  activityId: string;
  participantId: string;
  scannedByUserId: string;
  scannedAt: string;
}

export interface ActivityStats {
  activityId: string;
  activityName: string;
  totalScans: number;
  uniqueParticipants: number;
  scansByDay: { day: string; count: number }[];
}

export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  allowedActivityIds: string[];
  defaultActivityId?: string | null;
}

// ---- SaaS multi-tenant types ----
export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
}
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: string;
  region: string;
  plan: string;
  createdAt: string;
  previousSlug?: string | null;
  brandingLogoUrl?: string | null;
  brandingPrimaryColor?: string | null;
}
export interface EventInfo {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  defaultActivityId?: string | null;
  isArchived: boolean;
}
export interface Membership {
  orgId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  allowedActivityIds: string[];
  defaultActivityId?: string | null;
  defaultEventId?: string | null;
}
export interface Invitation {
  token: string;
  orgId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedByUserId?: string | null;
  acceptedAt?: string | null;
}

export interface Me {
  id: string;
  username: string;
  role: string;
  language: string;
  allowedActivityIds: string[];
  defaultActivityId?: string | null;
}

export const api = {
  login: (emailOrUsername: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername, password }),
    }),
  register: (email: string, username: string, password: string) =>
    request<LoginResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password, role: 'User' }),
    }),
  /** Discovery endpoint listing the federated identity providers wired in this environment. */
  getProviders: () => request<{ google: boolean; microsoft: boolean }>('/api/auth/providers'),
  me: () => request<Me>('/api/auth/me'),
  setMyDefaultActivity: (defaultActivityId: string | null) =>
    request<{ defaultActivityId: string | null }>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ defaultActivityId }),
    }),
  // NOTE: GET /api/auth/usernames was removed in the SaaS migration's Phase 0
  // hardening (account enumeration / OWASP A07). The login UI now requires
  // the user to type their own email/username.

  // ---- SaaS multi-tenant endpoints ----
  listMyOrgs: () => request<OrgSummary[]>('/api/me/orgs'),
  switchActiveOrg: (orgId: string) =>
    request<OrgSummary>('/api/me/active-org', { method: 'POST', body: JSON.stringify({ orgId }) }),
  createOrg: (name: string, slug?: string) =>
    request<Organization>('/api/orgs', { method: 'POST', body: JSON.stringify({ name, slug }) }),
  getOrg: (orgId: string) => request<Organization>(`/api/orgs/${orgId}`),
  updateOrg: (orgId: string, patch: Partial<Pick<Organization, 'name' | 'slug' | 'brandingLogoUrl' | 'brandingPrimaryColor'>> & { retentionDays?: number }) =>
    request<Organization>(`/api/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteOrg: (orgId: string) => request<void>(`/api/orgs/${orgId}`, { method: 'DELETE' }),

  listEvents: (orgId: string) => request<EventInfo[]>(`/api/orgs/${orgId}/events`),
  createEvent: (orgId: string, name: string, slug?: string) =>
    request<EventInfo>(`/api/orgs/${orgId}/events`, { method: 'POST', body: JSON.stringify({ name, slug }) }),
  updateEvent: (orgId: string, eventId: string, patch: Partial<Omit<EventInfo, 'id' | 'orgId' | 'slug'>>) =>
    request<EventInfo>(`/api/orgs/${orgId}/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteEvent: (orgId: string, eventId: string) =>
    request<void>(`/api/orgs/${orgId}/events/${eventId}`, { method: 'DELETE' }),

  listMemberships: (orgId: string) =>
    request<Membership[]>(`/api/orgs/${orgId}/memberships`),
  updateMembership: (orgId: string, userId: string, patch: Partial<Omit<Membership, 'orgId' | 'userId' | 'joinedAt'>>) =>
    request<Membership>(`/api/orgs/${orgId}/memberships/${userId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeMembership: (orgId: string, userId: string) =>
    request<void>(`/api/orgs/${orgId}/memberships/${userId}`, { method: 'DELETE' }),
  leaveOrg: (orgId: string) =>
    request<void>(`/api/orgs/${orgId}/memberships/me`, { method: 'DELETE' }),

  listInvitations: (orgId: string) =>
    request<Invitation[]>(`/api/orgs/${orgId}/invitations`),
  createInvitation: (orgId: string, email: string, role: string) =>
    request<Invitation>(`/api/orgs/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  acceptInvitation: (orgId: string, token: string) =>
    request<Membership>(`/api/orgs/${orgId}/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
    }),
  revokeInvitation: (orgId: string, token: string) =>
    request<void>(`/api/orgs/${orgId}/invitations/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    }),

  listActivities: () => request<Activity[]>('/api/activities'),
  createActivity: (a: Omit<Activity, 'id' | 'isActive' | 'isDefault'>) =>
    request<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(a) }),
  renameActivity: (id: string, name: string) =>
    request<Activity>(`/api/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteActivity: (id: string) => request<void>(`/api/activities/${id}`, { method: 'DELETE' }),
  resetActivityScans: (id: string) =>
    request<{ participantsDeleted: number; scansDeleted: number }>(
      `/api/activities/${id}/reset`,
      { method: 'POST' },
    ),

  listParticipants: (activityId: string) =>
    request<Participant[]>(`/api/activities/${activityId}/participants`),
  addParticipant: (activityId: string, displayName: string, email?: string) =>
    request<Participant>(`/api/activities/${activityId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ displayName, email }),
    }),

  scan: (activityId: string, participantId: string) =>
    request<Scan>(`/api/activities/${activityId}/scans`, {
      method: 'POST',
      body: JSON.stringify({ activityId, participantId }),
    }),
  listScans: (activityId: string) => request<Scan[]>(`/api/activities/${activityId}/scans`),
  stats: (activityId: string) => request<ActivityStats>(`/api/activities/${activityId}/stats`),
  reportCsvUrl: (activityId: string) => `/api/activities/${encodeURIComponent(activityId)}/report.csv`,

  listUsers: () => request<AppUser[]>('/api/users'),
  createUser: (u: { email: string; username: string; password: string; role: string; allowedActivityIds: string[]; defaultActivityId?: string }) =>
    request<AppUser>('/api/users', { method: 'POST', body: JSON.stringify(u) }),
  updateUser: (id: string, patch: { isActive?: boolean; defaultActivityId?: string | null; allowedActivityIds?: string[] }) =>
    request<AppUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
};

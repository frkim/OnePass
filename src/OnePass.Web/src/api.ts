const TOKEN_KEY = 'onepass.token';
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const tok = getToken();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
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
  me: () => request<{ id: string; username: string; role: string; language: string }>('/api/auth/me'),
  usernames: () => request<string[]>('/api/auth/usernames'),

  listActivities: () => request<Activity[]>('/api/activities'),
  createActivity: (a: Omit<Activity, 'id' | 'isActive'>) =>
    request<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(a) }),
  deleteActivity: (id: string) => request<void>(`/api/activities/${id}`, { method: 'DELETE' }),

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
  createUser: (u: { email: string; username: string; password: string; role: string }) =>
    request<AppUser>('/api/users', { method: 'POST', body: JSON.stringify(u) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),

  reset: () =>
    request<{ activitiesDeleted: number; participantsDeleted: number; scansDeleted: number }>(
      '/api/admin/reset',
      { method: 'POST' },
    ),
};

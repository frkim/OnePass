import { api, Scan } from './api';

/**
 * Queues scans in localStorage when offline and flushes them when the
 * browser reports a network connection again.
 */

interface PendingScan {
  activityId: string;
  participantId: string;
  queuedAt: number;
}

const KEY = 'onepass.pendingScans';

function read(): PendingScan[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as PendingScan[]; }
  catch { return []; }
}
function write(list: PendingScan[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function pendingCount(): number {
  return read().length;
}

export type ScanResult =
  | { status: 'sent'; scan: Scan }
  | { status: 'queued' };

export async function scanOrQueue(activityId: string, participantId: string): Promise<ScanResult> {
  if (!navigator.onLine) {
    write([...read(), { activityId, participantId, queuedAt: Date.now() }]);
    return { status: 'queued' };
  }
  try {
    const scan = await api.scan(activityId, participantId);
    return { status: 'sent', scan };
  } catch (err) {
    // Network-like failure: queue.
    if (err instanceof TypeError) {
      write([...read(), { activityId, participantId, queuedAt: Date.now() }]);
      return { status: 'queued' };
    }
    throw err;
  }
}

export async function flushQueue(): Promise<number> {
  const queue = read();
  if (queue.length === 0) return 0;
  const remaining: PendingScan[] = [];
  let flushed = 0;
  for (const item of queue) {
    try {
      await api.scan(item.activityId, item.participantId);
      flushed++;
    } catch {
      remaining.push(item);
    }
  }
  write(remaining);
  return flushed;
}

export function installQueueFlushHandler() {
  window.addEventListener('online', () => { void flushQueue(); });
}

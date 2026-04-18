import { describe, expect, it, beforeEach } from 'vitest';
import { pendingCount, scanOrQueue, flushQueue } from './scanQueue';

// Minimal localStorage polyfill for the jsdom env.
beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
});

describe('scanQueue', () => {
  it('queues when navigator is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const res = await scanOrQueue('a1', 'p1');
    expect(res.status).toBe('queued');
    expect(pendingCount()).toBe(1);
  });

  it('queues when fetch throws a network error while online', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const res = await scanOrQueue('a1', 'p1');
    expect(res.status).toBe('queued');
    expect(pendingCount()).toBe(1);
  });

  it('flushes queue when fetch succeeds', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await scanOrQueue('a1', 'p1');
    expect(pendingCount()).toBe(1);

    // Simulate a successful network
    globalThis.fetch = (() => Promise.resolve(new Response('{"id":"s1","activityId":"a1","participantId":"p1","scannedByUserId":"u","scannedAt":"2024-01-01T00:00:00Z"}', { status: 200, headers: { 'content-type': 'application/json' } }))) as typeof fetch;
    const flushed = await flushQueue();
    expect(flushed).toBe(1);
    expect(pendingCount()).toBe(0);
  });
});

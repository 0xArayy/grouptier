import { describe, expect, it, vi } from 'vitest';
import {
  emitSession,
  getConnectionCount,
  MAX_WS_PER_SESSION,
  offSession,
  onSession,
  removeConnection,
  tryAddConnection,
} from '../lib/sessionEvents.js';
import type { SharedPayload } from '../lib/sessionPayload.js';

// ── sessionPayload mock ────────────────────────────────────────────────────
// sessionEvents.ts fetches the shared payload before calling subscribers.
// Mock buildSharedPayload to return a minimal SharedPayload so the tests
// don't need a real DB connection.

const _FAKE_SHARED: SharedPayload = {
  base: {
    id: 'test',
    name: 'Test',
    status: 'collecting',
    options: [],
    voter_count: 0,
    result_count: 0,
    borda_ranking: [],
    share_url: 'https://t.me/bot/app?startapp=test',
  },
  creatorUserId: null,
  resultsRows: [],
};

vi.mock('../lib/sessionPayload.js', () => ({
  buildSharedPayload: vi.fn().mockResolvedValue({
    base: {
      id: 'test',
      name: 'Test',
      status: 'collecting',
      options: [],
      voter_count: 0,
      result_count: 0,
      borda_ranking: [],
      share_url: 'https://t.me/bot/app?startapp=test',
    },
    creatorUserId: null,
    resultsRows: [],
  }),
  hydratePayload: vi.fn((shared: SharedPayload) => ({ ...shared.base, my_result: null, can_close: true })),
  resolveEffectiveStatus: vi.fn((s: { status: string }) => s.status),
}));

// Flush all pending microtasks (Promise.resolve chains) so async emitSession
// subscribers have been called before we assert.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

// ── sessionEvents unit tests ────────────────────────────────────────────────
// These test the thin pub/sub wrapper that drives WS push notifications.
// Each test uses unique session IDs to avoid cross-test listener bleed since
// the subscriber map is a module-level singleton.

describe('sessionEvents', () => {
  it('calls registered callback when emitSession fires', async () => {
    const cb = vi.fn();
    onSession('ev-1', cb);
    emitSession('ev-1');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
    offSession('ev-1', cb);
  });

  it('does not call callback for a different session id', async () => {
    const cb = vi.fn();
    onSession('ev-2', cb);
    emitSession('ev-other');
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
    offSession('ev-2', cb);
  });

  it('stops calling callback after offSession', async () => {
    const cb = vi.fn();
    onSession('ev-3', cb);
    offSession('ev-3', cb);
    emitSession('ev-3');
    await flushMicrotasks();
    expect(cb).not.toHaveBeenCalled();
  });

  it('calls multiple callbacks registered for the same session', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onSession('ev-4', cb1);
    onSession('ev-4', cb2);
    emitSession('ev-4');
    await flushMicrotasks();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    offSession('ev-4', cb1);
    offSession('ev-4', cb2);
  });

  it('only removes the specific callback, not all callbacks for the session', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onSession('ev-5', cb1);
    onSession('ev-5', cb2);
    offSession('ev-5', cb1);
    emitSession('ev-5');
    await flushMicrotasks();
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    offSession('ev-5', cb2);
  });

  it('does not call removed callback on subsequent emits', async () => {
    const cb = vi.fn();
    onSession('ev-6', cb);
    emitSession('ev-6');
    await flushMicrotasks();
    offSession('ev-6', cb);
    emitSession('ev-6');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple rapid emits into a single DB fetch per session', async () => {
    // The broadcast coordinator batches all synchronous emitSession calls into
    // one microtask — subscribers are called once (with the latest state) rather
    // than three times. This is the intentional behaviour: a session that receives
    // three votes in the same tick only triggers one payload fetch.
    const cb = vi.fn();
    onSession('ev-7', cb);
    emitSession('ev-7');
    emitSession('ev-7');
    emitSession('ev-7');
    await flushMicrotasks();
    // Coalesced: 3 emits → 1 call (deduped by pendingBroadcasts Set)
    expect(cb).toHaveBeenCalledTimes(1);
    offSession('ev-7', cb);
  });

  it('passes SharedPayload to the callback', async () => {
    const cb = vi.fn();
    onSession('ev-8', cb);
    emitSession('ev-8');
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ base: expect.objectContaining({ id: 'test' }), resultsRows: [] }),
    );
    offSession('ev-8', cb);
  });
});

// ── WS connection cap tests ─────────────────────────────────────────────────
// Each test uses a unique session ID prefix ('cap-N') to avoid state bleed
// from the module-level connectionCounts map.

describe('connection cap', () => {
  it('tryAddConnection returns true and increments count', () => {
    expect(tryAddConnection('cap-1')).toBe(true);
    expect(getConnectionCount('cap-1')).toBe(1);
    removeConnection('cap-1');
  });

  it('count increments on each accepted connection', () => {
    tryAddConnection('cap-2');
    tryAddConnection('cap-2');
    expect(getConnectionCount('cap-2')).toBe(2);
    removeConnection('cap-2');
    removeConnection('cap-2');
  });

  it('removeConnection decrements count', () => {
    tryAddConnection('cap-3');
    tryAddConnection('cap-3');
    removeConnection('cap-3');
    expect(getConnectionCount('cap-3')).toBe(1);
    removeConnection('cap-3');
  });

  it('removeConnection deletes map entry when count reaches zero', () => {
    tryAddConnection('cap-4');
    removeConnection('cap-4');
    expect(getConnectionCount('cap-4')).toBe(0);
  });

  it('removeConnection on unknown session is a no-op', () => {
    expect(() => removeConnection('cap-never-added')).not.toThrow();
    expect(getConnectionCount('cap-never-added')).toBe(0);
  });

  it('returns false and does not increment when at cap', () => {
    const id = 'cap-5';
    for (let i = 0; i < MAX_WS_PER_SESSION; i++) tryAddConnection(id);
    expect(getConnectionCount(id)).toBe(MAX_WS_PER_SESSION);
    expect(tryAddConnection(id)).toBe(false);
    expect(getConnectionCount(id)).toBe(MAX_WS_PER_SESSION);
    for (let i = 0; i < MAX_WS_PER_SESSION; i++) removeConnection(id);
  });

  it('accepts a new connection after one is removed from a full session', () => {
    const id = 'cap-6';
    for (let i = 0; i < MAX_WS_PER_SESSION; i++) tryAddConnection(id);
    removeConnection(id);
    expect(tryAddConnection(id)).toBe(true);
    for (let i = 0; i < MAX_WS_PER_SESSION; i++) removeConnection(id);
  });

  it('counts are independent per session', () => {
    tryAddConnection('cap-7a');
    tryAddConnection('cap-7a');
    tryAddConnection('cap-7b');
    expect(getConnectionCount('cap-7a')).toBe(2);
    expect(getConnectionCount('cap-7b')).toBe(1);
    removeConnection('cap-7a');
    removeConnection('cap-7a');
    removeConnection('cap-7b');
  });
});

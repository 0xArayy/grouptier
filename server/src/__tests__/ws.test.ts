import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  emitSession, onSession, offSession,
  tryAddConnection, removeConnection, getConnectionCount, MAX_WS_PER_SESSION,
} from '../lib/sessionEvents.js';

// ── sessionEvents unit tests ────────────────────────────────────────────────
// These test the thin EventEmitter wrapper that drives WS push notifications.
// Each test uses unique session IDs to avoid cross-test listener bleed since
// the emitter is a module-level singleton.

describe('sessionEvents', () => {
  it('calls registered callback when emitSession fires', () => {
    const cb = vi.fn();
    onSession('ev-1', cb);
    emitSession('ev-1');
    expect(cb).toHaveBeenCalledTimes(1);
    offSession('ev-1', cb);
  });

  it('does not call callback for a different session id', () => {
    const cb = vi.fn();
    onSession('ev-2', cb);
    emitSession('ev-other');
    expect(cb).not.toHaveBeenCalled();
    offSession('ev-2', cb);
  });

  it('stops calling callback after offSession', () => {
    const cb = vi.fn();
    onSession('ev-3', cb);
    offSession('ev-3', cb);
    emitSession('ev-3');
    expect(cb).not.toHaveBeenCalled();
  });

  it('calls multiple callbacks registered for the same session', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onSession('ev-4', cb1);
    onSession('ev-4', cb2);
    emitSession('ev-4');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    offSession('ev-4', cb1);
    offSession('ev-4', cb2);
  });

  it('only removes the specific callback, not all callbacks for the session', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onSession('ev-5', cb1);
    onSession('ev-5', cb2);
    offSession('ev-5', cb1);
    emitSession('ev-5');
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    offSession('ev-5', cb2);
  });

  it('does not call removed callback on subsequent emits', () => {
    const cb = vi.fn();
    onSession('ev-6', cb);
    emitSession('ev-6');
    offSession('ev-6', cb);
    emitSession('ev-6');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('handles multiple emits before offSession', () => {
    const cb = vi.fn();
    onSession('ev-7', cb);
    emitSession('ev-7');
    emitSession('ev-7');
    emitSession('ev-7');
    expect(cb).toHaveBeenCalledTimes(3);
    offSession('ev-7', cb);
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

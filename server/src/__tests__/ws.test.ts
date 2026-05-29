import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitSession, onSession, offSession } from '../lib/sessionEvents.js';

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

import { buildSharedPayload, type SharedPayload } from './sessionPayload.js';

// ── Per-subscriber WS listeners ────────────────────────────────────────────

type Subscriber = (shared: SharedPayload) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function onSession(id: string, cb: Subscriber): void {
  let set = subscribers.get(id);
  if (!set) {
    set = new Set();
    subscribers.set(id, set);
  }
  set.add(cb);
}

export function offSession(id: string, cb: Subscriber): void {
  const set = subscribers.get(id);
  if (!set) return;
  set.delete(cb);
  if (set.size === 0) subscribers.delete(id);
}

// ── Broadcast coordinator ─────────────────────────────────────────────────
//
// Build the session payload ONCE per emitSession call, then fan it out to all
// subscribers in-memory. Coalesces rapid back-to-back emits (e.g. two votes in
// the same tick) into a single DB round-trip via a micro-task queue.
//
// Before this: N connected clients × 4 DB queries each = N×4 queries per event.
// After this:  3 queries total regardless of N.

const pendingBroadcasts = new Set<string>();
let broadcastScheduled = false;

async function processBroadcasts(): Promise<void> {
  broadcastScheduled = false;
  const ids = [...pendingBroadcasts];
  pendingBroadcasts.clear();

  await Promise.all(
    ids.map(async (id) => {
      const set = subscribers.get(id);
      if (!set || set.size === 0) return;
      try {
        const shared = await buildSharedPayload(id);
        if (!shared) return;
        for (const cb of set) cb(shared);
      } catch (err) {
        console.error(`broadcast error for session ${id}:`, err);
      }
    }),
  );
}

export function emitSession(id: string): void {
  pendingBroadcasts.add(id);
  if (!broadcastScheduled) {
    broadcastScheduled = true;
    // Use Promise.resolve().then() for micro-task scheduling — coalesces all
    // synchronous emitSession calls made in the same tick before hitting the DB.
    Promise.resolve()
      .then(() => processBroadcasts())
      .catch((err) => console.error('broadcast scheduler error:', err));
  }
}

// ── Per-session WS connection cap ──────────────────────────────────────────

export const MAX_WS_PER_SESSION = 500;

const connectionCounts = new Map<string, number>();

/** Returns true and increments the count if under cap; false if at or over cap. */
export function tryAddConnection(id: string): boolean {
  const count = connectionCounts.get(id) ?? 0;
  if (count >= MAX_WS_PER_SESSION) return false;
  connectionCounts.set(id, count + 1);
  return true;
}

/** Decrements the count; removes the map entry when it reaches zero. */
export function removeConnection(id: string): void {
  const remaining = (connectionCounts.get(id) ?? 1) - 1;
  if (remaining <= 0) connectionCounts.delete(id);
  else connectionCounts.set(id, remaining);
}

/** Exposed for tests. */
export function getConnectionCount(id: string): number {
  return connectionCounts.get(id) ?? 0;
}

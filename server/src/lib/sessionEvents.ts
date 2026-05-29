import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitSession(id: string): void {
  emitter.emit(`session:${id}`);
}

export function onSession(id: string, cb: () => void): void {
  emitter.on(`session:${id}`, cb);
}

export function offSession(id: string, cb: () => void): void {
  emitter.off(`session:${id}`, cb);
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

export function getConnectionCount(id: string): number {
  return connectionCounts.get(id) ?? 0;
}

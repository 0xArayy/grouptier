import { EventEmitter } from 'events';

const emitter = new EventEmitter();
// No hard cap — Telegram group sizes (20–200 members) are the natural limit.
// Add a Map-tracked cap if sessions ever get larger [websocket-connection-cap].
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

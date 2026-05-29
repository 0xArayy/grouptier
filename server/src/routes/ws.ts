import type { FastifyInstance } from 'fastify';
import { offSession, onSession, removeConnection, tryAddConnection } from '../lib/sessionEvents.js';
import { buildSharedPayload, hydratePayload, type SharedPayload } from '../lib/sessionPayload.js';
import { initDataMiddleware } from '../middleware/initData.js';

export async function wsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/ws/sessions/:id',
    { websocket: true, preHandler: initDataMiddleware },
    (socket, request) => {
      const { id } = request.params;
      const userId = request.telegramUser?.id;

      if (!tryAddConnection(id)) {
        socket.close(1013, 'Too many connections for this session');
        return;
      }

      // Receives the pre-built shared payload from the broadcast coordinator.
      // The shared payload was fetched ONCE for all subscribers — this callback
      // only does an in-memory my_result lookup (no extra DB queries).
      const push = (shared: SharedPayload) => {
        if (socket.readyState !== socket.OPEN) return;
        try {
          const payload = hydratePayload(shared, userId);
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(payload));
          }
        } catch (err) {
          console.error(`ws push error for session ${id}:`, err);
          socket.close(1011, 'internal error');
        }
      };

      // Register listener BEFORE pushing initial snapshot so no event is missed
      // during the query window (correctness requirement from eng review).
      onSession(id, push);

      // Send initial snapshot immediately so client has current state on connect.
      // The initial push must build the payload itself (no shared broadcast pending).
      buildSharedPayload(id)
        .then((shared) => {
          if (shared && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(hydratePayload(shared, userId)));
          }
        })
        .catch((err) => {
          console.error(`ws initial snapshot error for session ${id}:`, err);
          socket.close(1011, 'internal error');
        });

      socket.on('close', () => {
        offSession(id, push);
        removeConnection(id);
      });
    },
  );
}

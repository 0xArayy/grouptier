import type { FastifyInstance } from 'fastify';
import { initDataMiddleware } from '../middleware/initData.js';
import { buildSessionPayload } from '../lib/sessionPayload.js';
import { onSession, offSession } from '../lib/sessionEvents.js';

export async function wsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/ws/sessions/:id',
    { websocket: true, preHandler: initDataMiddleware },
    (socket, request) => {
      const { id } = request.params;
      const userId = request.telegramUser?.id;

      // Push updated session state to this client. Called on every emitSession(id).
      const push = async () => {
        if (socket.readyState !== socket.OPEN) return;
        try {
          const payload = await buildSessionPayload(id, userId);
          if (payload && socket.readyState === socket.OPEN) {
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
      push();

      socket.on('close', () => {
        offSession(id, push);
      });
    },
  );
}

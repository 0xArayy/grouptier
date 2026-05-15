import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';
import { computeBorda } from '../db/borda.js';
import { bot } from '../bot/bot.js';

export async function sessionRoutes(fastify: FastifyInstance) {
  // GET /api/sessions/:id — fetch session state for Mini App
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.telegramUser.id;

      const sessionRes = await pool.query(
        'SELECT * FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];

      // Register voter (idempotent)
      await pool.query(
        'INSERT INTO session_voters (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId],
      );

      const optionsRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      const options = optionsRes.rows.map((r: { text: string }) => r.text);

      const voterCount = await pool.query(
        'SELECT COUNT(*) FROM session_voters WHERE session_id = $1',
        [id],
      );
      const resultCount = await pool.query(
        'SELECT COUNT(*) FROM user_results WHERE session_id = $1',
        [id],
      );

      // Fetch all submitted ranked_lists for live Borda
      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );
      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));

      // Check if current user already voted
      const myResult = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1 AND user_id = $2',
        [id, userId],
      );

      return {
        id: session.id,
        name: session.name ?? 'Untitled Session',
        status: session.status,
        options,
        voter_count: parseInt(voterCount.rows[0].count),
        result_count: parseInt(resultCount.rows[0].count),
        borda_ranking: borda,
        my_result: myResult.rows[0]?.ranked_list ?? null,
      };
    },
  );

  // POST /api/sessions/:id/results — submit personal ranked list
  fastify.post<{ Params: { id: string }; Body: { ranked_list: string[]; initData?: string } }>(
    '/api/sessions/:id/results',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { ranked_list } = request.body;
      const userId = request.telegramUser.id;

      if (!Array.isArray(ranked_list) || ranked_list.length === 0) {
        return reply.status(400).send({ error: 'ranked_list must be a non-empty array' });
      }

      // Reject if session is closed
      const sessionRes = await pool.query(
        'SELECT status, name, message_id, chat_id FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];
      if (session.status === 'closed') {
        return reply.status(403).send({ error: 'Session is closed' });
      }

      // Upsert result
      await pool.query(
        `INSERT INTO user_results (session_id, user_id, ranked_list)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, user_id) DO UPDATE SET ranked_list = $3`,
        [id, userId, JSON.stringify(ranked_list)],
      );

      // Also register as voter
      await pool.query(
        'INSERT INTO session_voters (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId],
      );

      // Fetch updated Borda
      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );
      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));

      // CP1: update bot message vote count
      const voterCount = await pool.query(
        'SELECT COUNT(*) FROM session_voters WHERE session_id = $1',
        [id],
      );
      const resultCount = resultsRes.rows.length;
      const totalVoters = parseInt(voterCount.rows[0].count);

      if (session.message_id) {
        const tgLink = process.env.MINI_APP_TGLINK ?? '';
        const match = tgLink.match(/t\.me\/([^/?]+)\/([^/?]+)/);
        const miniAppUrl = match
          ? `tg://resolve?domain=${match[1]}&appname=${match[2]}&startapp=${id}`
          : `${tgLink}?startapp=${id}`;
        const safeName = (session.name ?? 'Untitled Session')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const text =
          `🗳️ Voting open for <b>${safeName}</b>!\n\n` +
          `<a href="${miniAppUrl}">🗳️ Cast your vote →</a>\n\n` +
          `${resultCount} of ${totalVoters} voted`;
        bot.api
          .editMessageText(session.chat_id, session.message_id, text, { parse_mode: 'HTML' })
          .catch((err: unknown) => console.error('editMessageText failed:', err));
      }

      return { borda_ranking: borda, result_count: resultCount, voter_count: totalVoters };
    },
  );
}

import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';
import { createSession } from '../lib/sessions.js';

export async function publicPollRoutes(fastify: FastifyInstance) {
  // GET /api/public-polls?q=<search>&limit=30 — search public poll templates
  fastify.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/public-polls',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, _reply) => {
      const q = (request.query.q ?? '').trim();
      const limit = Math.max(1, Math.min(parseInt(request.query.limit ?? '30', 10) || 30, 30));

      let res;
      if (q) {
        res = await pool.query(
          `SELECT id, name, emoji,
                  CASE WHEN show_author THEN author_name ELSE NULL END AS author_name,
                  uses_count,
                  jsonb_array_length(options) AS option_count
           FROM saved_polls
           WHERE is_public = true AND name ILIKE $1
           ORDER BY uses_count DESC, updated_at DESC
           LIMIT $2`,
          [`%${q}%`, limit],
        );
      } else {
        res = await pool.query(
          `SELECT id, name, emoji,
                  CASE WHEN show_author THEN author_name ELSE NULL END AS author_name,
                  uses_count,
                  jsonb_array_length(options) AS option_count
           FROM saved_polls
           WHERE is_public = true
           ORDER BY uses_count DESC, updated_at DESC
           LIMIT $1`,
          [limit],
        );
      }

      return res.rows;
    },
  );

  // POST /api/public-polls/:id/use — clone public template into a new session
  fastify.post<{ Params: { id: string } }>(
    '/api/public-polls/:id/use',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = request.params;
      const chat = request.telegramChat;
      const userId = request.telegramUser.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const pollRes = await client.query<{ name: string; options: string[] }>(
          'SELECT name, options FROM saved_polls WHERE id = $1 AND is_public = true FOR UPDATE',
          [id],
        );
        if (pollRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'Public poll not found' });
        }

        const { name, options } = pollRes.rows[0];

        // Create the session (409 guard included); pass client so the INSERT
        // participates in this transaction and won't orphan on options failure.
        const outcome = await createSession(chat, userId, name, client);
        if (outcome.conflict) {
          await client.query('ROLLBACK');
          return reply.status(409).send({ error: 'Session already exists', id: outcome.id, share_url: outcome.share_url });
        }

        // Bulk-insert options
        for (const text of options as string[]) {
          await client.query(
            'INSERT INTO options (session_id, text) VALUES ($1, $2)',
            [outcome.id, text],
          );
        }

        // Increment uses_count
        await client.query(
          'UPDATE saved_polls SET uses_count = uses_count + 1 WHERE id = $1',
          [id],
        );

        await client.query('COMMIT');
        return reply.status(201).send({ id: outcome.id, share_url: outcome.share_url, name, options: options as string[] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}

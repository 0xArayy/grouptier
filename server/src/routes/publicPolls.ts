import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { createSession } from '../lib/sessions.js';
import { initDataMiddleware } from '../middleware/initData.js';

export async function publicPollRoutes(fastify: FastifyInstance) {
  // GET /api/public-polls?q=<search>&limit=20&offset=0 — paginated public poll catalog
  // Response: { items: PublicPoll[], nextOffset: number | null }
  fastify.get<{ Querystring: { q?: string; limit?: string; offset?: string } }>(
    '/api/public-polls',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, _reply) => {
      const q = (request.query.q ?? '').trim();
      const limit = Math.max(1, Math.min(Number(request.query.limit) || 20, 50));
      const off = Math.max(0, Number(request.query.offset) || 0);
      // Fetch limit+1 to detect whether a next page exists (no COUNT query needed).
      const fetch = limit + 1;

      const res = q
        ? await pool.query(
            `SELECT id, name, emoji,
                    CASE WHEN show_author THEN author_name ELSE NULL END AS author_name,
                    uses_count,
                    jsonb_array_length(options) AS option_count,
                    categories,
                    mo.elem AS matched_option
             FROM saved_polls
             LEFT JOIN LATERAL (
               SELECT elem
               FROM jsonb_array_elements_text(options) elem
               WHERE elem ILIKE $1
               LIMIT 1
             ) mo ON true
             WHERE is_public = true
               AND (
                 name ILIKE $1
                 OR (jsonb_typeof(options) = 'array' AND mo.elem IS NOT NULL)
               )
             ORDER BY uses_count DESC, updated_at DESC
             LIMIT $2 OFFSET $3`,
            [`%${q}%`, fetch, off],
          )
        : await pool.query(
            `SELECT id, name, emoji,
                    CASE WHEN show_author THEN author_name ELSE NULL END AS author_name,
                    uses_count,
                    jsonb_array_length(options) AS option_count,
                    categories
             FROM saved_polls
             WHERE is_public = true
             ORDER BY uses_count DESC, updated_at DESC
             LIMIT $1 OFFSET $2`,
            [fetch, off],
          );

      const hasMore = res.rows.length > limit;
      const items = hasMore ? res.rows.slice(0, limit) : res.rows;
      const nextOffset = hasMore ? off + limit : null;
      return { items, nextOffset };
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

        if ((options as string[]).length === 0) {
          await client.query('ROLLBACK');
          return reply.status(422).send({ error: 'Public poll has no options' });
        }

        // Create the session (409 guard included); pass client so the INSERT
        // participates in this transaction and won't orphan on options failure.
        const outcome = await createSession(chat, userId, name, client);
        if (outcome.conflict) {
          await client.query('ROLLBACK');
          return reply
            .status(409)
            .send({ error: 'Session already exists', id: outcome.id, share_url: outcome.share_url });
        }

        // Single bulk INSERT — clock_timestamp() gives each row its own timestamp for stable ordering
        const vals = options as string[];
        const placeholders = vals.map((_, i) => `($1, $${i + 2}, clock_timestamp())`).join(', ');
        await client.query(`INSERT INTO options (session_id, text, created_at) VALUES ${placeholders}`, [
          outcome.id,
          ...vals,
        ]);

        // Increment uses_count
        await client.query('UPDATE saved_polls SET uses_count = uses_count + 1 WHERE id = $1', [id]);

        await client.query('COMMIT');
        return reply
          .status(201)
          .send({ id: outcome.id, share_url: outcome.share_url, name, options: options as string[] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}

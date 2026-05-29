import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { MAX_OPTION_TEXT_LENGTH, MAX_OPTIONS } from '../lib/constants.js';
import { initDataMiddleware } from '../middleware/initData.js';

interface SavedPoll {
  id: string;
  name: string;
  options: string[];
  emoji: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export async function savedPollRoutes(fastify: FastifyInstance) {
  // GET /api/saved-polls — list current user's saved poll templates
  fastify.get('/api/saved-polls', { preHandler: initDataMiddleware }, async (request, _reply) => {
    const userId = request.telegramUser.id;

    const res = await pool.query<SavedPoll>(
      'SELECT id, name, options, emoji, is_public, created_at, updated_at FROM saved_polls WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId],
    );

    return res.rows;
  });

  // POST /api/saved-polls — create a saved poll template
  fastify.post<{ Body: { name: string; options: string[]; emoji?: string } }>(
    '/api/saved-polls',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const name = (request.body?.name ?? '').trim();
      const options = request.body?.options ?? [];
      const emoji = (request.body?.emoji ?? '📝').trim() || '📝';

      if (!name) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (!Array.isArray(options) || options.length < 2) {
        return reply.status(400).send({ error: 'At least 2 options required' });
      }
      if (options.length > MAX_OPTIONS) {
        return reply.status(400).send({ error: 'Max 32 options allowed' });
      }
      if (
        !options.every(
          (o) => typeof o === 'string' && o.trim().length > 0 && o.length <= MAX_OPTION_TEXT_LENGTH,
        )
      ) {
        return reply
          .status(400)
          .send({ error: 'Each option must be a non-empty string of 100 characters or fewer' });
      }

      const res = await pool.query<{ id: string }>(
        `INSERT INTO saved_polls (user_id, name, options, emoji)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, name, JSON.stringify(options), emoji],
      );

      return reply.status(201).send({ id: res.rows[0].id });
    },
  );

  // PUT /api/saved-polls/:id — update a saved poll template
  fastify.put<{ Params: { id: string }; Body: { name?: string; options?: string[]; emoji?: string } }>(
    '/api/saved-polls/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const { id } = request.params;
      const name = (request.body?.name ?? '').trim();
      const options = request.body?.options;
      const emoji = request.body?.emoji !== undefined ? request.body.emoji.trim() || '📝' : undefined;

      if (!name && options === undefined && emoji === undefined) {
        return reply.status(400).send({ error: 'Nothing to update' });
      }
      if (options !== undefined) {
        if (!Array.isArray(options) || options.length < 2) {
          return reply.status(400).send({ error: 'At least 2 options required' });
        }
        if (options.length > MAX_OPTIONS) {
          return reply.status(400).send({ error: 'Max 32 options allowed' });
        }
        if (
          !options.every(
            (o) => typeof o === 'string' && o.trim().length > 0 && o.length <= MAX_OPTION_TEXT_LENGTH,
          )
        ) {
          return reply
            .status(400)
            .send({ error: 'Each option must be a non-empty string of 100 characters or fewer' });
        }
      }

      const setParts: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (name) {
        setParts.push(`name = $${paramIdx++}`);
        values.push(name);
      }
      if (options !== undefined) {
        setParts.push(`options = $${paramIdx++}`);
        values.push(JSON.stringify(options));
      }
      if (emoji !== undefined) {
        setParts.push(`emoji = $${paramIdx++}`);
        values.push(emoji);
      }

      values.push(id, userId);
      const res = await pool.query(
        `UPDATE saved_polls SET ${setParts.join(', ')} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} RETURNING id`,
        values,
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Saved poll not found' });
      }
      return { ok: true };
    },
  );

  // POST /api/saved-polls/:id/publish — make a saved poll publicly visible
  fastify.post<{ Params: { id: string }; Body: { show_author?: boolean; categories?: string[] } }>(
    '/api/saved-polls/:id/publish',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const { id } = request.params;
      const showAuthor = request.body?.show_author === true;
      const authorName = showAuthor ? (request.telegramUser.first_name ?? null) : null;

      const VALID_CATEGORIES = new Set(['games', 'food', 'movies', 'series', 'music', 'sport', 'other']);
      const rawCats = Array.isArray(request.body?.categories) ? request.body.categories : [];
      const categories = rawCats
        .filter((c): c is string => typeof c === 'string' && VALID_CATEGORIES.has(c))
        .slice(0, 3);

      const res = await pool.query(
        `UPDATE saved_polls
         SET is_public = true, show_author = $1, author_name = $2, categories = $3, updated_at = NOW()
         WHERE id = $4 AND user_id = $5
         RETURNING id`,
        [showAuthor, authorName, categories, id, userId],
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Saved poll not found' });
      }
      return { ok: true };
    },
  );

  // POST /api/saved-polls/:id/unpublish — remove a saved poll from public catalog
  fastify.post<{ Params: { id: string } }>(
    '/api/saved-polls/:id/unpublish',
    { preHandler: initDataMiddleware, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const { id } = request.params;

      const res = await pool.query(
        `UPDATE saved_polls SET is_public = false, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, userId],
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Saved poll not found' });
      }
      return { ok: true };
    },
  );

  // DELETE /api/saved-polls/:id — delete a saved poll template
  fastify.delete<{ Params: { id: string } }>(
    '/api/saved-polls/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const { id } = request.params;

      const res = await pool.query('DELETE FROM saved_polls WHERE id = $1 AND user_id = $2 RETURNING id', [
        id,
        userId,
      ]);

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Saved poll not found' });
      }
      return { ok: true };
    },
  );
}

import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';

interface SavedPoll {
  id: string;
  name: string;
  options: string[];
  emoji: string;
  created_at: string;
  updated_at: string;
}

export async function savedPollRoutes(fastify: FastifyInstance) {
  // GET /api/saved-polls — list current user's saved poll templates
  fastify.get(
    '/api/saved-polls',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const userId = request.telegramUser.id;

      const res = await pool.query<SavedPoll>(
        'SELECT id, name, options, emoji, created_at, updated_at FROM saved_polls WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId],
      );

      return res.rows;
    },
  );

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
      if (options.length > 12) {
        return reply.status(400).send({ error: 'Max 12 options allowed' });
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
      const emoji = request.body?.emoji !== undefined ? (request.body.emoji.trim() || '📝') : undefined;

      if (!name && options === undefined && emoji === undefined) {
        return reply.status(400).send({ error: 'Nothing to update' });
      }
      if (options !== undefined) {
        if (!Array.isArray(options) || options.length < 2) {
          return reply.status(400).send({ error: 'At least 2 options required' });
        }
        if (options.length > 12) {
          return reply.status(400).send({ error: 'Max 12 options allowed' });
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

  // DELETE /api/saved-polls/:id — delete a saved poll template
  fastify.delete<{ Params: { id: string } }>(
    '/api/saved-polls/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const userId = request.telegramUser.id;
      const { id } = request.params;

      const res = await pool.query(
        'DELETE FROM saved_polls WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId],
      );

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Saved poll not found' });
      }
      return { ok: true };
    },
  );
}

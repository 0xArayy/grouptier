import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';

export async function templateRoutes(fastify: FastifyInstance) {
  // GET /api/templates — public, no auth required
  // Returns all public templates with uses_7d count and hot flag (top-3 by 7-day uses).
  fastify.get('/api/templates', async () => {
    const res = await pool.query(`
      WITH uses_7d AS (
        SELECT template_id, COUNT(*)::int AS cnt
        FROM template_uses
        WHERE used_at >= NOW() - INTERVAL '7 days'
        GROUP BY template_id
      ),
      top3 AS (
        SELECT template_id
        FROM uses_7d
        ORDER BY cnt DESC
        LIMIT 3
      )
      SELECT
        t.id,
        t.emoji,
        t.name,
        t.options,
        t.author,
        t.official,
        t.category,
        COALESCE(u.cnt, 0) AS uses_7d,
        (t.id IN (SELECT template_id FROM top3) AND COALESCE(u.cnt, 0) >= 1) AS hot
      FROM public_templates t
      LEFT JOIN uses_7d u ON u.template_id = t.id
      ORDER BY COALESCE(u.cnt, 0) DESC, t.created_at ASC
    `);
    return res.rows;
  });

  // POST /api/templates/:id/use — authenticated, records a use event
  fastify.post<{ Params: { id: string } }>(
    '/api/templates/:id/use',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      const check = await pool.query(
        'SELECT id FROM public_templates WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return reply.status(404).send({ error: 'Template not found' });
      }

      await pool.query(
        'INSERT INTO template_uses (template_id) VALUES ($1)',
        [id],
      );

      return { ok: true };
    },
  );
}

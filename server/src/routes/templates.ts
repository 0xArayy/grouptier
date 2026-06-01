import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';

let cache: { data: unknown[]; ts: number } | null = null;
const CACHE_TTL = 30_000;

/** Exposed for tests — resets the in-process cache. */
export function clearTemplateCache() {
  cache = null;
}

const FULL_QUERY = `
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
    t.tags,
    COALESCE(u.cnt, 0) AS uses_7d,
    (t.id IN (SELECT template_id FROM top3) AND COALESCE(u.cnt, 0) >= 1) AS hot
  FROM public_templates t
  LEFT JOIN uses_7d u ON u.template_id = t.id
  ORDER BY COALESCE(u.cnt, 0) DESC, t.created_at ASC
`;

export async function templateRoutes(fastify: FastifyInstance) {
  // GET /api/templates — public, no auth required
  // Returns paginated public templates. Query params: limit (default 30, max 100), offset (default 0).
  // Response: { items: [], nextOffset: number | null }
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/templates', async (request) => {
    const lim = Math.min(Math.max(1, Number(request.query.limit) || 30), 100);
    const off = Math.max(0, Number(request.query.offset) || 0);

    if (!cache || Date.now() - cache.ts >= CACHE_TTL) {
      const res = await pool.query(FULL_QUERY);
      cache = { data: res.rows, ts: Date.now() };
    }

    const all = cache?.data ?? [];
    const items = all.slice(off, off + lim);
    const nextOffset = off + lim < all.length ? off + lim : null;
    return { items, nextOffset };
  });

  // POST /api/templates/:id/use — authenticated, records a use event
  fastify.post<{ Params: { id: string } }>(
    '/api/templates/:id/use',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return reply.status(400).send({ error: 'Invalid template id' });
      }

      const check = await pool.query('SELECT id FROM public_templates WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        return reply.status(404).send({ error: 'Template not found' });
      }

      await pool.query('INSERT INTO template_uses (template_id) VALUES ($1)', [id]);

      return { ok: true };
    },
  );
}

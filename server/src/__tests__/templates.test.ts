import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTemplateCache } from '../routes/templates.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

// vi.hoisted ensures mockQuery is initialized before the vi.mock factory runs
// (necessary because clearTemplateCache is a static import that triggers early module resolution)
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery } }));

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown }) => {
    req.telegramUser = { id: 42, first_name: 'TestUser' };
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { templateRoutes } = await import('../routes/templates.js');
  await fastify.register(templateRoutes);
  await fastify.ready();
  return fastify;
}

// ── GET /api/templates ─────────────────────────────────────────────────────

describe('GET /api/templates', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    clearTemplateCache();
    app = await buildApp();
  });

  it('returns template list with HOT and uses_7d fields', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: TEMPLATE_ID,
          emoji: '🎮',
          name: 'Во что сыграем?',
          options: ['Minecraft', 'Valorant'],
          author: 'GroupTier',
          official: true,
          category: 'games',
          uses_7d: 5,
          hot: true,
        },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/api/templates' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.nextOffset).toBeNull();
    expect(body.items[0]).toMatchObject({
      id: TEMPLATE_ID,
      name: 'Во что сыграем?',
      official: true,
      hot: true,
      uses_7d: 5,
    });
  });

  it('returns empty array when no templates exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({ method: 'GET', url: '/api/templates' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toEqual([]);
    expect(body.nextOffset).toBeNull();
  });

  it('serves second request from cache — DB called only once', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: TEMPLATE_ID, name: 'Poll', options: [] }] });

    await app.inject({ method: 'GET', url: '/api/templates' });
    await app.inject({ method: 'GET', url: '/api/templates' });

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('supports ?limit and ?offset pagination', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}`, name: `T${i}` }));
    mockQuery.mockResolvedValueOnce({ rows });

    // page 1: limit=2, offset=0
    const res1 = await app.inject({ method: 'GET', url: '/api/templates?limit=2&offset=0' });
    const body1 = JSON.parse(res1.body);
    expect(body1.items).toHaveLength(2);
    expect(body1.nextOffset).toBe(2);

    // page 2: limit=2, offset=2 — served from cache, no second DB call
    const res2 = await app.inject({ method: 'GET', url: '/api/templates?limit=2&offset=2' });
    const body2 = JSON.parse(res2.body);
    expect(body2.items).toHaveLength(2);
    expect(body2.nextOffset).toBe(4);

    // page 3: last item, nextOffset null
    const res3 = await app.inject({ method: 'GET', url: '/api/templates?limit=2&offset=4' });
    const body3 = JSON.parse(res3.body);
    expect(body3.items).toHaveLength(1);
    expect(body3.nextOffset).toBeNull();

    // DB hit exactly once despite 3 requests
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('clamps limit to max 100', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TEMPLATE_ID, name: 'Poll' }] });
    const res = await app.inject({ method: 'GET', url: '/api/templates?limit=999' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1); // only 1 row in mock
  });
});

// ── POST /api/templates/:id/use ────────────────────────────────────────────

describe('POST /api/templates/:id/use', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/templates/not-a-uuid/use',
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Invalid template id' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when template does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT → not found

    const res = await app.inject({
      method: 'POST',
      url: `/api/templates/${TEMPLATE_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Template not found' });
  });

  it('records use and returns ok when template exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEMPLATE_ID }] }) // SELECT → found
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const res = await app.inject({
      method: 'POST',
      url: `/api/templates/${TEMPLATE_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO template_uses/);
    expect(insertCall[1]).toEqual([TEMPLATE_ID]);
  });
});

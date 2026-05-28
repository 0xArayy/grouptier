import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
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
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
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
    expect(JSON.parse(res.body)).toEqual([]);
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

const mockQuery = vi.fn();
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery } }));

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown }) => {
    req.telegramUser = { id: 42, first_name: 'Test' };
  },
}));

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { savedPollRoutes } = await import('../routes/savedPolls.js');
  await fastify.register(savedPollRoutes);
  await fastify.ready();
  return fastify;
}

const POLL_ID = '00000000-0000-0000-0000-000000000001';

describe('POST /api/saved-polls', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('creates saved poll and returns 201', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/saved-polls',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'My Template', options: ['Option A', 'Option B'], emoji: '🎉' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe(POLL_ID);
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/saved-polls',
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('name is required');
  });

  it('returns 400 when fewer than 2 options provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/saved-polls',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Test', options: ['Only one'] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('At least 2 options required');
  });

  it('returns 400 when more than 32 options provided', async () => {
    const tooMany = Array.from({ length: 33 }, (_, i) => `Option ${i + 1}`);

    const res = await app.inject({
      method: 'POST',
      url: '/api/saved-polls',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Big Template', options: tooMany },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Max 32 options allowed');
  });

  it('accepts exactly 32 options', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });
    const exactly32 = Array.from({ length: 32 }, (_, i) => `Option ${i + 1}`);

    const res = await app.inject({
      method: 'POST',
      url: '/api/saved-polls',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Max Template', options: exactly32 },
    });

    expect(res.statusCode).toBe(201);
  });
});

describe('PUT /api/saved-polls/:id', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('updates name and returns ok', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/saved-polls/${POLL_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Renamed' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('returns 400 when more than 32 options provided', async () => {
    const tooMany = Array.from({ length: 33 }, (_, i) => `Option ${i + 1}`);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/saved-polls/${POLL_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Test', options: tooMany },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Max 32 options allowed');
  });

  it('accepts exactly 32 options on update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });
    const exactly32 = Array.from({ length: 32 }, (_, i) => `Option ${i + 1}`);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/saved-polls/${POLL_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Max', options: exactly32 },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when poll not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/saved-polls/${POLL_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Ghost' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when nothing to update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/saved-polls/${POLL_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Nothing to update');
  });
});

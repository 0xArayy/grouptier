import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery, connect: mockConnect } }));

vi.mock('../lib/urls.js', () => ({
  buildVoteUrl: (id: string) => `https://t.me/bot/app?startapp=${id}`,
}));

let mockChat: { id: number } | null = null;

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown; telegramChat: unknown }) => {
    req.telegramUser = { id: 42, first_name: 'TestUser' };
    req.telegramChat = mockChat;
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockClient() {
  return { query: vi.fn(), release: vi.fn() };
}

const POLL_ID = '00000000-0000-0000-0000-000000000099';
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

async function buildPublicApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { publicPollRoutes } = await import('../routes/publicPolls.js');
  await fastify.register(publicPollRoutes);
  await fastify.ready();
  return fastify;
}

async function buildSavedApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { savedPollRoutes } = await import('../routes/savedPolls.js');
  await fastify.register(savedPollRoutes);
  await fastify.ready();
  return fastify;
}

// ── GET /api/public-polls ──────────────────────────────────────────────────

describe('GET /api/public-polls', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildPublicApp();
  });

  it('returns public polls list without query', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: POLL_ID, name: 'Movies', emoji: '🎬', author_name: 'Alice', uses_count: 5, option_count: 3 },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: POLL_ID, name: 'Movies', emoji: '🎬', option_count: 3, uses_count: 5 });
  });

  it('returns filtered list when q is provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls?q=games', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][0]).toBe('%games%');
  });

  it('returns author_name as null when show_author=false (SQL CASE WHEN)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: POLL_ID, name: 'Anon Poll', emoji: '🎮', author_name: null, uses_count: 0, option_count: 2 }],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    const body = JSON.parse(res.body);
    expect(body[0].author_name).toBeNull();
  });

  it('returns option_count not full options array', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: POLL_ID, name: 'Test', emoji: '✅', author_name: 'Bob', uses_count: 1, option_count: 10 }],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    const body = JSON.parse(res.body);
    expect(body[0].option_count).toBe(10);
    expect(body[0].options).toBeUndefined();
  });
});

// ── POST /api/public-polls/:id/use ─────────────────────────────────────────

describe('POST /api/public-polls/:id/use', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildPublicApp();
  });

  it('creates session with options and increments uses_count', async () => {
    const client = makeMockClient();
    mockConnect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ name: 'Movies', options: ['A', 'B'] }] }) // SELECT poll FOR UPDATE
      .mockResolvedValueOnce(undefined) // INSERT option A
      .mockResolvedValueOnce(undefined) // INSERT option B
      .mockResolvedValueOnce(undefined) // UPDATE uses_count
      .mockResolvedValueOnce(undefined); // COMMIT

    // createSession uses pool.query (no chat → skip 409 check, just INSERT)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/public-polls/${POLL_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(SESSION_ID);
    expect(body.share_url).toContain(SESSION_ID);
    expect(body.options).toEqual(['A', 'B']);
    expect(body.name).toBe('Movies');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('returns 404 when poll not found or not public', async () => {
    const client = makeMockClient();
    mockConnect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT poll → not found

    // ROLLBACK on 404
    client.query.mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/api/public-polls/${POLL_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Public poll not found');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('returns 409 when group already has a collecting session', async () => {
    mockChat = { id: -1001 };
    const client = makeMockClient();
    mockConnect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ name: 'Movies', options: ['A', 'B'] }] }); // SELECT poll

    // createSession → 409 guard fires (existing session found)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // existing session SELECT

    // ROLLBACK on 409
    client.query.mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/api/public-polls/${POLL_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(SESSION_ID);
    expect(body.share_url).toBeDefined();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back transaction and rethrows on unexpected DB error', async () => {
    const client = makeMockClient();
    mockConnect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ name: 'Movies', options: ['A', 'B'] }] }); // SELECT poll

    // createSession throws
    mockQuery.mockRejectedValueOnce(new Error('DB exploded'));

    // ROLLBACK
    client.query.mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/api/public-polls/${POLL_ID}/use`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(500);
    const rollbackCall = client.query.mock.calls.find(c => c[0] === 'ROLLBACK');
    expect(rollbackCall).toBeDefined();
    expect(client.release).toHaveBeenCalledOnce();
  });
});

// ── POST /api/saved-polls/:id/publish ─────────────────────────────────────

describe('POST /api/saved-polls/:id/publish', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildSavedApp();
  });

  it('publishes with show_author=true and snapshots author_name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/publish`,
      headers: { 'x-init-data': 'dev' },
      payload: { show_author: true },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][0]).toBe(true); // show_author
    expect(callArgs[1][1]).toBe('TestUser'); // author_name snapshot
  });

  it('publishes anonymously when show_author=false', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/publish`,
      headers: { 'x-init-data': 'dev' },
      payload: { show_author: false },
    });

    expect(res.statusCode).toBe(200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][0]).toBe(false); // show_author
    expect(callArgs[1][1]).toBeNull(); // author_name is null
  });

  it('returns 404 when poll not found or owned by someone else', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/publish`,
      headers: { 'x-init-data': 'dev' },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Saved poll not found');
  });
});

// ── POST /api/saved-polls/:id/unpublish ───────────────────────────────────

describe('POST /api/saved-polls/:id/unpublish', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildSavedApp();
  });

  it('unpublishes successfully', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/unpublish`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('is_public = false');
  });

  it('returns 404 when poll not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/unpublish`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
  });
});

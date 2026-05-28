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

  it('returns paginated list with items and nextOffset', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: POLL_ID, name: 'Movies', emoji: '🎬', author_name: 'Alice', uses_count: 5, option_count: 3, categories: [] },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.nextOffset).toBeNull();
    expect(body.items[0]).toMatchObject({ id: POLL_ID, name: 'Movies', emoji: '🎬', option_count: 3, uses_count: 5 });
  });

  it('returns filtered list when q is provided — passes %q% as first param', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls?q=games', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][0]).toBe('%games%');
  });

  it('returns author_name as null when show_author=false (SQL CASE WHEN)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: POLL_ID, name: 'Anon Poll', emoji: '🎮', author_name: null, uses_count: 0, option_count: 2, categories: [] }],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    const body = JSON.parse(res.body);
    expect(body.items[0].author_name).toBeNull();
  });

  it('returns option_count not full options array', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: POLL_ID, name: 'Test', emoji: '✅', author_name: 'Bob', uses_count: 1, option_count: 10, categories: [] }],
    });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls', headers: { 'x-init-data': 'dev' } });

    const body = JSON.parse(res.body);
    expect(body.items[0].option_count).toBe(10);
    expect(body.items[0].options).toBeUndefined();
  });

  it('sets nextOffset when more results exist (limit+1 trick)', async () => {
    // Mock returns limit+1 = 21 rows → hasMore=true
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`, name: `Poll ${i}`, emoji: '🎮',
      author_name: null, uses_count: 0, option_count: 2, categories: [],
    }));
    mockQuery.mockResolvedValueOnce({ rows });

    const res = await app.inject({
      method: 'GET',
      url: '/api/public-polls?limit=20&offset=0',
      headers: { 'x-init-data': 'dev' },
    });

    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(20);      // trimmed to limit
    expect(body.nextOffset).toBe(20);         // off + limit
  });

  it('passes offset to SQL and returns null nextOffset on last page', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `id-${i}`, name: `Poll ${i}`, emoji: '🎮',
      author_name: null, uses_count: 0, option_count: 2, categories: [],
    }));
    mockQuery.mockResolvedValueOnce({ rows });

    const res = await app.inject({
      method: 'GET',
      url: '/api/public-polls?limit=20&offset=40',
      headers: { 'x-init-data': 'dev' },
    });

    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(3);
    expect(body.nextOffset).toBeNull();
    // offset passed to SQL as second (non-q) param
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][1]).toBe(40); // offset=$2
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
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // createSession INSERT (no chat → no guard)
      .mockResolvedValueOnce(undefined) // INSERT option A
      .mockResolvedValueOnce(undefined) // INSERT option B
      .mockResolvedValueOnce(undefined) // UPDATE uses_count
      .mockResolvedValueOnce(undefined); // COMMIT

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
      .mockResolvedValueOnce({ rows: [{ name: 'Movies', options: ['A', 'B'] }] }) // SELECT poll
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }) // createSession guard SELECT (existing found → 409)
      .mockResolvedValueOnce(undefined); // ROLLBACK on 409

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
      .mockResolvedValueOnce({ rows: [{ name: 'Movies', options: ['A', 'B'] }] }) // SELECT poll
      .mockRejectedValueOnce(new Error('DB exploded')) // createSession INSERT throws
      .mockResolvedValueOnce(undefined); // ROLLBACK

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

// ── GET /api/public-polls — coverage gaps ─────────────────────────────────

describe('GET /api/public-polls (additional coverage)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildPublicApp();
  });

  it('respects custom limit parameter (capped at 50, uses limit+1 fetch)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({ method: 'GET', url: '/api/public-polls?q=test&limit=100', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][1]).toBe(51); // clamped to 50, then +1 for hasMore detection
  });
});

// ── GET /api/saved-polls — is_public field ────────────────────────────────

describe('GET /api/saved-polls', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildSavedApp();
  });

  it('includes is_public field in response', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: POLL_ID, name: 'Test', options: ['A', 'B'], emoji: '🎬', is_public: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
      ],
    });

    const res = await app.inject({ method: 'GET', url: '/api/saved-polls', headers: { 'x-init-data': 'dev' } });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body[0].is_public).toBe(true);
  });
});

// ── POST /api/saved-polls/:id/publish — show_author default ───────────────

describe('POST /api/saved-polls/:id/publish (additional coverage)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChat = null;
    app = await buildSavedApp();
  });

  it('defaults show_author to false (anonymous) when body field is omitted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: POLL_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/saved-polls/${POLL_ID}/publish`,
      headers: { 'x-init-data': 'dev' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1][0]).toBe(false); // show_author defaults to false (privacy-safe)
    expect(callArgs[1][1]).toBeNull(); // author_name is null when anonymous
  });
});

// ── lib/sessions.ts — 23505 race-condition TOCTOU fallback ────────────────

describe('createSession — 23505 race-condition fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockChat = null;
  });

  it('returns conflict when 23505 INSERT race and fallback SELECT finds session', async () => {
    const dupError = Object.assign(new Error('unique violation'), { code: '23505' });
    const { createSession } = await import('../lib/sessions.js');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })            // initial SELECT: no existing session
      .mockRejectedValueOnce(dupError)                // INSERT: 23505 race
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // fallback SELECT: finds it

    const result = await createSession({ id: -1001 }, 42, 'Test Session');
    expect(result.conflict).toBe(true);
    expect(result.id).toBe(SESSION_ID);
  });

  it('rethrows 23505 when chat is null (no fallback possible)', async () => {
    const dupError = Object.assign(new Error('unique violation'), { code: '23505' });
    const { createSession } = await import('../lib/sessions.js');
    mockQuery.mockRejectedValueOnce(dupError);

    await expect(createSession(null, 42, 'Test')).rejects.toThrow('unique violation');
  });

  it('rethrows 23505 when fallback SELECT finds nothing (session disappeared)', async () => {
    const dupError = Object.assign(new Error('unique violation'), { code: '23505' });
    const { createSession } = await import('../lib/sessions.js');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // initial SELECT: no existing
      .mockRejectedValueOnce(dupError)       // INSERT: 23505
      .mockResolvedValueOnce({ rows: [] });  // fallback SELECT: empty

    await expect(createSession({ id: -1001 }, 42, 'Test')).rejects.toThrow('unique violation');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery, connect: mockConnect } }));

const mockSendMessage = vi.fn();
const mockSendPhoto = vi.fn();
const mockEditMessageCaption = vi.fn();
vi.mock('../bot/bot.js', () => ({
  bot: {
    api: {
      sendMessage: mockSendMessage,
      sendPhoto: mockSendPhoto,
      editMessageCaption: mockEditMessageCaption,
    },
  },
}));

// Stub card builders — plain functions so vi.resetAllMocks() doesn't wipe return values
const FAKE_IMG = Buffer.from('fake-png');
vi.mock('../bot/cards.js', () => ({
  buildVotingCard: () => ({
    image: FAKE_IMG,
    caption: 'test caption',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '▶ VOTE', url: 'https://t.me/test' }]] },
  }),
  buildVotingCaption: () => 'test caption',
  buildWinnerCard: () => ({
    image: FAKE_IMG,
    caption: '🥇 Winner',
    parse_mode: 'HTML',
  }),
  buildSetupCard: () => ({
    image: FAKE_IMG,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '⚙️ SET UP', url: 'https://t.me/test' }]] },
  }),
}));

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown; telegramChat: unknown }) => {
    req.telegramUser = { id: 42, first_name: 'Test' };
    req.telegramChat = { id: -1001, type: 'supergroup', title: 'Test Group' };
  },
}));

const mockEmitSession = vi.fn();
vi.mock('../lib/sessionEvents.js', () => ({ emitSession: mockEmitSession }));

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { sessionRoutes } = await import('../routes/sessions.js');
  await fastify.register(sessionRoutes);
  await fastify.ready();
  return fastify;
}

// SQL-text mock helper — routes each pool.query() call to the first pending
// expectation whose `match` substring appears in the SQL. Order-independent:
// adding/removing queries between matched ones won't break unrelated assertions.
function qMocks(expectations: Array<{ match: string; rows: unknown[] }>) {
  const pending = expectations.map(e => ({ ...e }));
  mockQuery.mockImplementation((sql: string) => {
    const idx = pending.findIndex(e => sql.includes(e.match));
    if (idx === -1) {
      throw new Error(`qMocks: unmatched SQL\n  sql: ${sql.slice(0, 120)}\n  remaining: [${pending.map(e => `"${e.match}"`).join(', ')}]`);
    }
    const [{ rows }] = pending.splice(idx, 1);
    return Promise.resolve({ rows });
  });
}

// Stable session fixture
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('creates session and returns 201', async () => {
    // no existing collecting session
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // insert returns id
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'My Poll' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing session

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'a'.repeat(101) },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Name must be 100 characters or fewer');
  });

  it('returns 409 when collecting session already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] });

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'My Poll' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Session already exists', id: SESSION_ID });
  });
});

describe('GET /api/sessions/active', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns collecting session when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: SESSION_ID, name: 'My Poll', status: 'collecting' }],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
  });

  it('returns 404 with error body when no active session', async () => {
    // Regression: frontend App.tsx used msg.includes('404') to detect this case,
    // but ApiError.message is body.error ("No active session"), not "HTTP 404".
    // The server must return status 404 — the frontend now checks err.status === 404.
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('No active session');
  });
});

describe('GET /api/sessions/:id', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns session state', async () => {
    qMocks([
      { match: 'SELECT * FROM sessions', rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting' }] },
      { match: 'INSERT INTO session_voters', rows: [] },
      { match: 'SELECT text FROM options', rows: [] },
      { match: 'COUNT(*) FROM session_voters', rows: [{ count: '1' }] },
      { match: 'COUNT(*) FROM user_results', rows: [{ count: '0' }] },
      { match: 'user_id, ranked_list FROM user_results', rows: [] },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
  });

  it('returns 404 when session missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('surfaces voting+message_sent=false as collecting (crash recovery)', async () => {
    qMocks([
      { match: 'SELECT * FROM sessions', rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: false }] },
      { match: 'INSERT INTO session_voters', rows: [] },
      { match: 'SELECT text FROM options', rows: [] },
      { match: 'COUNT(*) FROM session_voters', rows: [{ count: '1' }] },
      { match: 'COUNT(*) FROM user_results', rows: [{ count: '0' }] },
      { match: 'user_id, ranked_list FROM user_results', rows: [] },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('collecting');
  });

  it('returns my_result for current user when they have submitted', async () => {
    // pg returns BIGINT user_id as string; String() coercion ensures type-safe match against JS number
    qMocks([
      { match: 'SELECT * FROM sessions', rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: true }] },
      { match: 'INSERT INTO session_voters', rows: [] },
      { match: 'SELECT text FROM options', rows: [{ text: 'Alpha' }, { text: 'Beta' }] },
      { match: 'COUNT(*) FROM session_voters', rows: [{ count: '2' }] },
      { match: 'COUNT(*) FROM user_results', rows: [{ count: '1' }] },
      { match: 'user_id, ranked_list FROM user_results', rows: [{ user_id: '42', ranked_list: ['Alpha', 'Beta'] }] },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).my_result).toEqual(['Alpha', 'Beta']);
  });
});

describe('POST /api/sessions/:id/options', () => {
  let app: FastifyInstance;
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
    mockClient = { query: vi.fn(), release: vi.fn() };
    mockConnect.mockResolvedValue(mockClient);
  });

  it('adds option and returns updated list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] }); // session check
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT
      .mockResolvedValueOnce({ rows: [] }) // dup check
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] }) // SELECT all
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Sushi' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).options).toContain('Sushi');
  });

  it('returns 200 with current options on duplicate option', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] }); // session check
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // dup found
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }] }); // SELECT all

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Pizza' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza']);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 422 when 32-option limit reached', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] }); // session check
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ count: '32' }] }) // COUNT — limit reached
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Overflow' },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe('Max 32 options reached');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 400 when option text exceeds 100 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'a'.repeat(101) },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Option text must be 100 characters or fewer');
  });

  it('returns 400 when text is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: '   ' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/sessions/:id/vote', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('starts voting, sends photo card, returns ok', async () => {
    qMocks([
      { match: 'SELECT id, name, chat_id, status', rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'collecting' }] },
      { match: 'COUNT(*) FROM options', rows: [{ count: '3' }] },
      { match: "SET status = 'voting'", rows: [] },
      { match: 'SELECT text FROM options', rows: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
      { match: 'SET message_id', rows: [] },
    ]);

    mockSendPhoto.mockResolvedValueOnce({ message_id: 999 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(mockSendPhoto).toHaveBeenCalledOnce();
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE sessions SET message_id = $1, message_sent = true WHERE id = $2',
      [999, SESSION_ID],
    );
  });

  it('rolls back and returns 502 when sendPhoto fails', async () => {
    qMocks([
      { match: 'SELECT id, name, chat_id, status', rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'collecting' }] },
      { match: 'COUNT(*) FROM options', rows: [{ count: '2' }] },
      { match: "SET status = 'voting'", rows: [] },
      { match: 'SELECT text FROM options', rows: [{ text: 'A' }, { text: 'B' }] },
      { match: "SET status = 'collecting'", rows: [] },
    ]);

    mockSendPhoto.mockRejectedValueOnce(new Error('Telegram API error'));

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(502);
    expect(mockQuery).toHaveBeenCalledWith(
      "UPDATE sessions SET status = 'collecting' WHERE id = $1",
      [SESSION_ID],
    );
  });

  it('returns 422 when fewer than 2 options', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'collecting' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(422);
  });

  it('returns 409 when session is not in collecting state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'voting' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(409);
  });
});

describe('PATCH /api/sessions/:id', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'a'.repeat(101) },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Name must be 100 characters or fewer');
  });

  it('updates session name and returns ok', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ creator_user_id: null }] }) // session check
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('returns 404 when session not found or not in collecting state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when caller is not the creator', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ creator_user_id: 99 }] }); // creator_user_id 99 ≠ middleware userId 42

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Hijacked' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Only the creator can rename this poll');
  });
});

describe('POST /api/sessions/:id/results', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when ranked_list length does not match option count', async () => {
    qMocks([
      { match: 'SELECT status, name', rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] },
      { match: 'SELECT text FROM options', rows: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'B'] }, // missing 'C'
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/ranked_list must contain all/);
  });

  it('returns 403 when session is closed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'closed', name: 'Poll', message_id: null, chat_id: -1001 }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Session is closed');
  });

  it('submits result and returns borda ranking', async () => {
    qMocks([
      { match: 'SELECT status, name', rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] },
      { match: 'SELECT text FROM options', rows: [{ text: 'A' }, { text: 'B' }] },
      { match: 'INSERT INTO user_results', rows: [] },
      { match: 'INSERT INTO session_voters', rows: [] },
      { match: 'ranked_list FROM user_results', rows: [{ ranked_list: ['A', 'B'] }] },
      { match: 'COUNT(*) FROM session_voters', rows: [{ count: '1' }] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).borda_ranking).toBeDefined();
    expect(JSON.parse(res.body).result_count).toBe(1);
    expect(mockEmitSession).toHaveBeenCalledWith(SESSION_ID);
  });
});

describe('GET /api/sessions/:id/options', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns options list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{}] }); // session exists
    mockQuery.mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza', 'Sushi']);
  });

  it('returns 404 for unknown session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // session not found

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/sessions/:id/options/:text', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('removes option and returns remaining list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session check
      .mockResolvedValueOnce({ rows: [] }) // delete
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }] }); // remaining options

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${SESSION_ID}/options/${encodeURIComponent('Sushi')}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza']);
  });

  it('returns 403 when session is not collecting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'voting', chat_id: -1001, creator_user_id: null }] });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${SESSION_ID}/options/${encodeURIComponent('Sushi')}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when caller is not the creator', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: 99 }] }); // creator 99 ≠ middleware userId 42

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${SESSION_ID}/options/${encodeURIComponent('Sushi')}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Only the creator can remove options');
  });
});

describe('PUT /api/sessions/:id/options', () => {
  let app: FastifyInstance;
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
    mockClient = { query: vi.fn(), release: vi.fn() };
    mockConnect.mockResolvedValue(mockClient);
  });

  it('replaces options atomically and returns 200', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['Pizza', 'Sushi'] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza', 'Sushi']);
  });

  it('updates name atomically when provided', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session
      .mockResolvedValueOnce({ rows: [] }) // UPDATE name
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ text: 'A' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A'], name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['A']);
  });

  it('handles empty options array (clears all options)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // SELECT (no INSERT since empty)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual([]);
  });

  it('deduplicates options case-insensitively', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // INSERT (2 unique, not 3)
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['Pizza', 'PIZZA', 'Sushi'] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza', 'Sushi']);
  });

  it('returns 422 when more than MAX_OPTIONS provided', async () => {
    const tooMany = Array.from({ length: 33 }, (_, i) => `Option ${i + 1}`);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: tooMany },
    });

    expect(res.statusCode).toBe(422);
  });

  it('returns 400 when options is not an array', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: 'not-an-array' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when session not found', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // session — not found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A'] },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when session is not collecting', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'voting', chat_id: -1001 }] }) // session
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A'] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when name exceeds max length', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A'], name: 'n'.repeat(101) },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when an option text exceeds max length', async () => {
    const longText = 'a'.repeat(101);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: [longText] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rolls back transaction and returns 500 on DB error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: null }] }) // session
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockRejectedValueOnce(new Error('DB failure')) // INSERT fails
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['A'] },
    });

    expect(res.statusCode).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 403 when caller is not the creator', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001, creator_user_id: 99 }] }) // session — creator 99 ≠ middleware userId 42
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await app.inject({
      method: 'PUT',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { options: ['Pizza', 'Sushi'] },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Only the creator can replace options');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('POST /api/sessions/:id/close', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('closes session and returns winner', async () => {
    qMocks([
      { match: 'SELECT id, name, chat_id, creator_user_id', rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, creator_user_id: 42, status: 'voting' }] },
      { match: "SET status = 'closed'", rows: [] },
      { match: 'ranked_list FROM user_results', rows: [{ ranked_list: ['A', 'B'] }, { ranked_list: ['B', 'A'] }] },
    ]);
    mockSendPhoto.mockResolvedValueOnce({ message_id: 1 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(JSON.parse(res.body).winner).toBeTruthy();
    expect(mockEmitSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('returns 409 when session is not in voting state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, creator_user_id: null, status: 'collecting' }] }); // SELECT — wrong status

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns winner=null when no votes have been cast', async () => {
    qMocks([
      { match: 'SELECT id, name, chat_id, creator_user_id', rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, creator_user_id: 42, status: 'voting' }] },
      { match: "SET status = 'closed'", rows: [] },
      { match: 'ranked_list FROM user_results', rows: [] },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).winner).toBeNull();
  });

  it('returns 403 when caller is not the creator (group session)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, creator_user_id: 99, status: 'voting' }] }); // creator 99 ≠ middleware userId 42

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('Only the creator can close this poll');
  });
});

describe('POST /api/sessions/:id/results — validation', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when ranked_list is not an array', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ text: 'A' }, { text: 'B' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: 'not-an-array' as unknown as string[] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/ranked_list/);
  });

  it('returns 400 when ranked_list contains an invalid option', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ text: 'A' }, { text: 'B' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'INJECTED'] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Invalid option/);
  });

  it('returns 400 when ranked_list has duplicates', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ text: 'A' }, { text: 'B' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'A'] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Duplicate options in ranked_list');
  });

  it('returns 404 when session not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Session not found');
  });
});

describe('PATCH /api/sessions/:id — validation', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when name is empty', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
      payload: { name: '  ' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('name is required');
  });
});

describe('POST /api/sessions/:id/vote — not found', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 404 when session not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Session not found');
  });
});

describe('DELETE /api/sessions/:id/options/:text — not found', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 404 when session not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${SESSION_ID}/options/${encodeURIComponent('Sushi')}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Session not found');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery } }));

const mockSendMessage = vi.fn();
vi.mock('../bot/bot.js', () => ({
  bot: { api: { sendMessage: mockSendMessage } },
}));

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown; telegramChat: unknown }) => {
    req.telegramUser = { id: 42, first_name: 'Test' };
    req.telegramChat = { id: -1001, type: 'supergroup', title: 'Test Group' };
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify();
  const { sessionRoutes } = await import('../routes/sessions.js');
  await fastify.register(sessionRoutes);
  await fastify.ready();
  return fastify;
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

  it('returns 404 when no active session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/sessions/:id', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns session state', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting' }] })
      .mockResolvedValueOnce({ rows: [] }) // register voter
      .mockResolvedValueOnce({ rows: [] }) // options
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // voter count
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // result count
      .mockResolvedValueOnce({ rows: [] }); // user_results (provides both borda + my_result via JS filter)

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
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: false }] })
      .mockResolvedValueOnce({ rows: [] }) // register voter
      .mockResolvedValueOnce({ rows: [] }) // options
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // voter count
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // result count
      .mockResolvedValueOnce({ rows: [] }); // user_results (provides both borda + my_result via JS filter)

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('collecting');
  });

  it('returns my_result for current user when they have submitted', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: true }] })
      .mockResolvedValueOnce({ rows: [] }) // register voter
      .mockResolvedValueOnce({ rows: [{ text: 'Alpha' }, { text: 'Beta' }] }) // options
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // voter count
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // result count
      // pg returns BIGINT user_id as string; loose == in route matches against number 42
      .mockResolvedValueOnce({ rows: [{ user_id: '42', ranked_list: ['Alpha', 'Beta'] }] });

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
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('adds option and returns updated list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] }) // session check
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count check
      .mockResolvedValueOnce({ rows: [] }) // dup check
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] }); // all options

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
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // dup found
      .mockResolvedValueOnce({ rows: [{ text: 'Pizza' }] }); // current options

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Pizza' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza']);
  });

  it('returns 422 when 12-option limit reached', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ count: '12' }] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Overflow' },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe('Max 12 options reached');
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

  it('starts voting, sends message, returns ok', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'collecting' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // option count
      .mockResolvedValueOnce({ rows: [] }) // update status to voting
      .mockResolvedValueOnce({ rows: [] }); // update message_id + message_sent=true

    mockSendMessage.mockResolvedValueOnce({ message_id: 999 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE sessions SET message_id = $1, message_sent = true WHERE id = $2',
      [999, SESSION_ID],
    );
  });

  it('rolls back and returns 502 when sendMessage fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001, status: 'collecting' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] }) // update to voting
      .mockResolvedValueOnce({ rows: [] }); // rollback update

    mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(502);
    // rollback was called
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
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] });

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
});

describe('POST /api/sessions/:id/results', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns 400 when ranked_list length does not match option count', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] }); // 3 options

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
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'voting', name: 'Poll', message_id: null, chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ text: 'A' }, { text: 'B' }] }) // options
      .mockResolvedValueOnce({ rows: [] }) // upsert user_results
      .mockResolvedValueOnce({ rows: [] }) // insert session_voters
      .mockResolvedValueOnce({ rows: [{ ranked_list: ['A', 'B'] }] }) // all results
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // voter count

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/results`,
      headers: { 'x-init-data': 'dev' },
      payload: { ranked_list: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).borda_ranking).toBeDefined();
    expect(JSON.parse(res.body).result_count).toBe(1);
  });
});

describe('GET /api/sessions/:id/options', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('returns options list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ text: 'Pizza' }, { text: 'Sushi' }] });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).options).toEqual(['Pizza', 'Sushi']);
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
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] }) // session check
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
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'voting', chat_id: -1001 }] });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${SESSION_ID}/options/${encodeURIComponent('Sushi')}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/sessions/:id/close', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  it('closes session and returns winner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001 }] }) // atomic update
      .mockResolvedValueOnce({ rows: [{ ranked_list: ['A', 'B'] }, { ranked_list: ['B', 'A'] }] }); // results
    mockSendMessage.mockResolvedValueOnce({ message_id: 1 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(JSON.parse(res.body).winner).toBeTruthy();
  });

  it('returns 409 when session is not in voting state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update returns nothing

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns winner=null when no votes have been cast', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', chat_id: -1001 }] }) // atomic update
      .mockResolvedValueOnce({ rows: [] }); // no results

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).winner).toBeNull();
  });
});

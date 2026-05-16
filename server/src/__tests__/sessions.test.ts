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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('returns session state', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting' }] })
      .mockResolvedValueOnce({ rows: [] }) // register voter
      .mockResolvedValueOnce({ rows: [] }) // options
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // voter count
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // result count
      .mockResolvedValueOnce({ rows: [] }) // ranked lists
      .mockResolvedValueOnce({ rows: [] }); // my_result

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
      .mockResolvedValueOnce({ rows: [] }) // ranked lists
      .mockResolvedValueOnce({ rows: [] }); // my_result

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('collecting');
  });
});

describe('POST /api/sessions/:id/options', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
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

  it('returns 422 on duplicate option', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'collecting', chat_id: -1001 }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // dup found

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/options`,
      headers: { 'x-init-data': 'dev' },
      payload: { text: 'Pizza' },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe('Duplicate option');
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
    vi.clearAllMocks();
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
});

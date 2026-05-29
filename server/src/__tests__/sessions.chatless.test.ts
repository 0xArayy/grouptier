import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock('../db/client.js', () => ({ pool: { query: mockQuery, connect: mockConnect } }));

const mockSendPhoto = vi.fn();
const mockEditMessageCaption = vi.fn();
vi.mock('../bot/bot.js', () => ({
  bot: { api: { sendPhoto: mockSendPhoto, editMessageCaption: mockEditMessageCaption } },
}));

const FAKE_IMG = Buffer.from('fake-png');
vi.mock('../bot/cards.js', () => ({
  buildVotingCard: () => ({
    image: FAKE_IMG,
    caption: 'test caption',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '▶ VOTE', url: 'https://t.me/test' }]] },
  }),
  buildVotingCaption: () => 'test caption',
  buildWinnerCard: () => ({ image: FAKE_IMG, caption: '🥇 Winner', parse_mode: 'HTML' }),
  buildSetupCard: () => ({
    image: FAKE_IMG,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '⚙️ SET UP', url: 'https://t.me/test' }]] },
  }),
}));

vi.mock('../lib/urls.js', () => ({
  buildVoteUrl: (id: string) => `https://t.me/grouptier_bot/vote?startapp=${id}`,
}));

// Mutable middleware state — allows per-test chatless vs group switching
let mockChatId: number | null = null;
let mockUserId = 42;

vi.mock('../middleware/initData.js', () => ({
  initDataMiddleware: async (req: { telegramUser: unknown; telegramChat: unknown }) => {
    req.telegramUser = { id: mockUserId, first_name: 'Test' };
    req.telegramChat =
      mockChatId !== null ? { id: mockChatId, type: 'supergroup', title: 'Test Group' } : null;
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

const SESSION_ID = '00000000-0000-0000-0000-000000000002';

// ── Chatless creation ──────────────────────────────────────────────────────

describe('POST /api/sessions (chatless)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = null;
    mockUserId = 42;
    app = await buildApp();
  });

  it('creates session with chat_id=null and creator_user_id set', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // INSERT returns id

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev-chatless' },
      payload: { name: 'My Chatless Poll' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
    // No 409 check call (chat is null, skip the SELECT)
    expect(mockQuery).toHaveBeenCalledTimes(1);
    // creator_user_id should be 42 (from mock middleware)
    expect(mockQuery).toHaveBeenCalledWith(
      "INSERT INTO sessions (chat_id, creator_user_id, name, status) VALUES ($1, $2, $3, 'collecting') RETURNING id",
      [null, 42, 'My Chatless Poll'],
    );
  });

  it('does not enforce 409 race guard for chatless sessions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // INSERT ok

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev-chatless' },
      payload: { name: 'Second Poll' },
    });

    // Should succeed — no 409 check for null chat
    expect(res.statusCode).toBe(201);
  });
});

// ── Group session regression ───────────────────────────────────────────────

describe('POST /api/sessions (group regression)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = -1001;
    mockUserId = 42;
    app = await buildApp();
  });

  it('creates group session with chat_id and creator_user_id set', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing collecting session
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // INSERT

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Group Poll' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
    expect(mockQuery).toHaveBeenCalledWith(
      "INSERT INTO sessions (chat_id, creator_user_id, name, status) VALUES ($1, $2, $3, 'collecting') RETURNING id",
      [-1001, 42, 'Group Poll'],
    );
  });

  it('still enforces 409 for group sessions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] }); // existing session

    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'x-init-data': 'dev' },
      payload: { name: 'Another' },
    });

    expect(res.statusCode).toBe(409);
  });
});

// ── Chatless active lookup ─────────────────────────────────────────────────

describe('GET /api/sessions/active (chatless)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = null;
    mockUserId = 42;
    app = await buildApp();
  });

  it('finds chatless session by creator_user_id', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: SESSION_ID, name: 'My Poll', status: 'collecting' }],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(SESSION_ID);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('creator_user_id = $1 AND chat_id IS NULL'),
      [42],
    );
  });

  it('returns 404 when no chatless session for user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('uses ORDER BY created_at DESC LIMIT 1 for tiebreaker', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SESSION_ID, name: 'Latest', status: 'collecting' }] });

    await app.inject({
      method: 'GET',
      url: '/api/sessions/active',
      headers: { 'x-init-data': 'dev-chatless' },
    });

    const call = mockQuery.mock.calls[0];
    expect(call[0]).toContain('ORDER BY created_at DESC LIMIT 1');
  });
});

// ── effectiveStatus fix ────────────────────────────────────────────────────

describe('GET /api/sessions/:id effectiveStatus (chatless)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = null;
    mockUserId = 42;
    app = await buildApp();
  });

  it('shows voting (not collecting) for chatless session with message_sent=false', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: false, chat_id: null }],
      })
      .mockResolvedValueOnce({ rows: [] }) // register voter
      .mockResolvedValueOnce({ rows: [] }) // options
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // voter count
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // result count
      .mockResolvedValueOnce({ rows: [] }); // user_results

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
    // Chatless + message_sent=false should NOT be treated as crash recovery
    expect(JSON.parse(res.body).status).toBe('voting');
  });

  it('still recovers crash for group session with message_sent=false', async () => {
    mockChatId = -1001;
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', status: 'voting', message_sent: false, chat_id: -1001 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${SESSION_ID}`,
      headers: { 'x-init-data': 'dev' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('collecting');
  });
});

// ── Chatless vote (no sendPhoto) ───────────────────────────────────────────

describe('POST /api/sessions/:id/vote (chatless)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = null;
    mockUserId = 42;
    app = await buildApp();
  });

  it('flips status to voting without calling sendPhoto, returns share_url', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', chat_id: null, status: 'collecting' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // option count
      .mockResolvedValueOnce({ rows: [] }); // update status to voting

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/vote`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(JSON.parse(res.body).share_url).toContain(SESSION_ID);
    expect(mockSendPhoto).not.toHaveBeenCalled();
  });
});

// ── Chatless close ─────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/close (chatless)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetAllMocks();
    mockChatId = null;
    mockUserId = 42;
    app = await buildApp();
  });

  it('closes session and returns winner without calling sendPhoto', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', chat_id: null, creator_user_id: 42, status: 'voting' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // update to closed
      .mockResolvedValueOnce({ rows: [{ ranked_list: ['A', 'B'] }, { ranked_list: ['A', 'B'] }] }); // results

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(JSON.parse(res.body).winner).toBe('A');
    expect(mockSendPhoto).not.toHaveBeenCalled();
  });

  it('returns winner=null when no votes', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', chat_id: null, creator_user_id: 42, status: 'voting' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // update to closed
      .mockResolvedValueOnce({ rows: [] }); // no results

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, winner: null });
  });

  it('returns 403 when non-creator tries to close chatless session', async () => {
    mockUserId = 99; // different user from creator_user_id=42
    mockQuery
      // pg returns BIGINT as string — simulate that here
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', chat_id: null, creator_user_id: '42', status: 'voting' }],
      });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toContain('creator');
  });

  it('does not block close when creator_user_id is null (legacy session)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, name: 'Poll', chat_id: null, creator_user_id: null, status: 'voting' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // update to closed
      .mockResolvedValueOnce({ rows: [] }); // no results

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/close`,
      headers: { 'x-init-data': 'dev-chatless' },
    });

    expect(res.statusCode).toBe(200);
  });
});

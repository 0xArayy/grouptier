import type { FastifyInstance } from 'fastify';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';
import { computeBorda } from '../db/borda.js';
import { bot } from '../bot/bot.js';

function buildVoteUrl(sessionId: string): string {
  const tgLink = (process.env.MINI_APP_TGLINK ?? '').replace(/\/$/, '');
  return `${tgLink}?startapp=${sessionId}`;
}

export async function sessionRoutes(fastify: FastifyInstance) {
  // POST /api/sessions — create session from Mini App (chat_id from validated initData)
  fastify.post<{ Body: { name?: string } }>(
    '/api/sessions',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const chat = request.telegramChat;
      if (!chat) {
        return reply.status(400).send({ error: 'No chat context. Open from a group.' });
      }

      // 409 race guard: one collecting session per chat at a time
      const existing = await pool.query(
        "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
        [chat.id],
      );
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: 'Session already exists', id: existing.rows[0].id });
      }

      const name = (request.body?.name ?? '').trim() || 'Untitled Session';
      try {
        const res = await pool.query(
          "INSERT INTO sessions (chat_id, name, status) VALUES ($1, $2, 'collecting') RETURNING id",
          [chat.id, name],
        );
        return reply.status(201).send({ id: res.rows[0].id });
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          // Concurrent INSERT raced past the SELECT — unique index caught it
          const fallback = await pool.query(
            "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
            [chat.id],
          );
          return reply.status(409).send({ error: 'Session already exists', id: fallback.rows[0]?.id });
        }
        throw err;
      }
    },
  );

  // GET /api/sessions/active — return current collecting session for this chat
  fastify.get(
    '/api/sessions/active',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const chat = request.telegramChat;
      if (!chat) {
        return reply.status(400).send({ error: 'No chat context. Open from a group.' });
      }

      const res = await pool.query(
        "SELECT id, name, status FROM sessions WHERE chat_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1",
        [chat.id],
      );
      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'No active session' });
      }
      return res.rows[0];
    },
  );

  // GET /api/sessions/:id — fetch session state for Mini App
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.telegramUser.id;

      const sessionRes = await pool.query(
        'SELECT * FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];

      // Register voter (idempotent)
      await pool.query(
        'INSERT INTO session_voters (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId],
      );

      const optionsRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      const options = optionsRes.rows.map((r: { text: string }) => r.text);

      const voterCount = await pool.query(
        'SELECT COUNT(*) FROM session_voters WHERE session_id = $1',
        [id],
      );
      const resultCount = await pool.query(
        'SELECT COUNT(*) FROM user_results WHERE session_id = $1',
        [id],
      );

      // Fetch all submitted ranked_lists for live Borda
      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );
      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));

      // Check if current user already voted
      const myResult = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1 AND user_id = $2',
        [id, userId],
      );

      return {
        id: session.id,
        name: session.name ?? 'Untitled Session',
        status: session.status,
        options,
        voter_count: parseInt(voterCount.rows[0].count),
        result_count: parseInt(resultCount.rows[0].count),
        borda_ranking: borda,
        my_result: myResult.rows[0]?.ranked_list ?? null,
      };
    },
  );

  // POST /api/sessions/:id/results — submit personal ranked list
  fastify.post<{ Params: { id: string }; Body: { ranked_list: string[]; initData?: string } }>(
    '/api/sessions/:id/results',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { ranked_list } = request.body;
      const userId = request.telegramUser.id;

      if (!Array.isArray(ranked_list) || ranked_list.length === 0) {
        return reply.status(400).send({ error: 'ranked_list must be a non-empty array' });
      }

      // Reject if session is closed
      const sessionRes = await pool.query(
        'SELECT status, name, message_id, chat_id FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];
      if (session.status === 'closed') {
        return reply.status(403).send({ error: 'Session is closed' });
      }

      // Validate ranked_list items are actual session options (no injected/duplicate entries)
      const validOptRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1',
        [id],
      );
      const validOptions = new Set<string>(validOptRes.rows.map((r: { text: string }) => r.text));
      for (const opt of ranked_list) {
        if (!validOptions.has(opt)) {
          return reply.status(400).send({ error: `Invalid option: ${opt}` });
        }
      }
      if (new Set(ranked_list).size !== ranked_list.length) {
        return reply.status(400).send({ error: 'Duplicate options in ranked_list' });
      }

      // Upsert result
      await pool.query(
        `INSERT INTO user_results (session_id, user_id, ranked_list)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, user_id) DO UPDATE SET ranked_list = $3`,
        [id, userId, JSON.stringify(ranked_list)],
      );

      // Also register as voter
      await pool.query(
        'INSERT INTO session_voters (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId],
      );

      // Fetch updated Borda
      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );
      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));

      // CP1: update bot message vote count
      const voterCount = await pool.query(
        'SELECT COUNT(*) FROM session_voters WHERE session_id = $1',
        [id],
      );
      const resultCount = resultsRes.rows.length;
      const totalVoters = parseInt(voterCount.rows[0].count);

      if (session.message_id) {
        const miniAppUrl = `${(process.env.MINI_APP_TGLINK ?? '').replace(/\/$/, '')}?startapp=${id}`;
        const text =
          `🗳️ Voting open for ${session.name ?? 'Untitled Session'}!\n\n` +
          `${resultCount} of ${totalVoters} voted`;
        bot.api
          .editMessageText(session.chat_id, session.message_id, text, {
            reply_markup: {
              inline_keyboard: [[{ text: '🗳️ Cast your vote →', url: miniAppUrl }]],
            },
          })
          .catch((err: unknown) => console.error('editMessageText failed:', err));
      }

      return { borda_ranking: borda, result_count: resultCount, voter_count: totalVoters };
    },
  );

  // POST /api/sessions/:id/options — add option (dedup + limit 12)
  fastify.post<{ Params: { id: string }; Body: { text: string } }>(
    '/api/sessions/:id/options',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const text = (request.body?.text ?? '').trim();

      if (!text) {
        return reply.status(400).send({ error: 'text is required' });
      }

      const chat = request.telegramChat;
      if (!chat) {
        return reply.status(400).send({ error: 'No chat context. Open from a group.' });
      }

      const sessionRes = await pool.query(
        'SELECT status, chat_id FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      if (sessionRes.rows[0].chat_id !== chat.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (sessionRes.rows[0].status !== 'collecting') {
        return reply.status(403).send({ error: 'Session is not collecting options' });
      }

      const countRes = await pool.query(
        'SELECT COUNT(*) FROM options WHERE session_id = $1',
        [id],
      );
      if (parseInt(countRes.rows[0].count) >= 12) {
        return reply.status(422).send({ error: 'Max 12 options reached' });
      }

      const dupRes = await pool.query(
        'SELECT 1 FROM options WHERE session_id = $1 AND LOWER(text) = LOWER($2)',
        [id, text],
      );
      if (dupRes.rows.length > 0) {
        return reply.status(422).send({ error: 'Duplicate option' });
      }

      await pool.query('INSERT INTO options (session_id, text) VALUES ($1, $2)', [id, text]);

      const allRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      return reply.status(201).send({ options: allRes.rows.map((r: { text: string }) => r.text) });
    },
  );

  // POST /api/sessions/:id/vote — flip to voting, send bot message, rollback on failure
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/vote',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      const chat = request.telegramChat;
      if (!chat) {
        return reply.status(400).send({ error: 'No chat context. Open from a group.' });
      }

      const sessionRes = await pool.query(
        'SELECT id, name, chat_id, status FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];
      if (session.chat_id !== chat.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (session.status !== 'collecting') {
        return reply.status(409).send({ error: 'Session is not in collecting state' });
      }

      const countRes = await pool.query(
        'SELECT COUNT(*) FROM options WHERE session_id = $1',
        [id],
      );
      if (parseInt(countRes.rows[0].count) < 2) {
        return reply.status(422).send({ error: 'Need at least 2 options' });
      }

      await pool.query("UPDATE sessions SET status = 'voting' WHERE id = $1", [id]);

      const miniAppUrl = buildVoteUrl(id);
      const name = session.name ?? 'Untitled Session';
      try {
        const sent = await bot.api.sendMessage(
          session.chat_id,
          `🗳️ Voting open for ${name}!\n\n0 of 0 voted`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🗳️ Cast your vote →', url: miniAppUrl }]],
            },
          },
        );
        await pool.query('UPDATE sessions SET message_id = $1 WHERE id = $2', [sent.message_id, id]);
        return { ok: true };
      } catch (err) {
        // Rollback status on sendMessage failure
        await pool.query("UPDATE sessions SET status = 'collecting' WHERE id = $1", [id]);
        console.error('sendMessage failed:', err);
        return reply.status(502).send({ error: 'Failed to send vote message to group' });
      }
    },
  );
}

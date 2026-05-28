import type { FastifyInstance } from 'fastify';
import { InputFile } from 'grammy';
import { pool } from '../db/client.js';
import { initDataMiddleware } from '../middleware/initData.js';
import { computeBorda } from '../db/borda.js';
import { bot } from '../bot/bot.js';
import { buildVoteUrl } from '../lib/urls.js';
import { buildVotingCard, buildVotingCaption, buildWinnerCard } from '../bot/cards.js';
import { MAX_NAME_LENGTH, MAX_OPTION_TEXT_LENGTH, MAX_OPTIONS } from '../lib/constants.js';
import { createSession } from '../lib/sessions.js';

export async function sessionRoutes(fastify: FastifyInstance) {
  // POST /api/sessions — create session from Mini App (chat_id from validated initData)
  fastify.post<{ Body: { name?: string } }>(
    '/api/sessions',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const chat = request.telegramChat;
      const userId = request.telegramUser.id;

      const rawName = (request.body?.name ?? '').trim();
      if (rawName.length > MAX_NAME_LENGTH) {
        return reply.status(400).send({ error: 'Name must be 100 characters or fewer' });
      }

      const outcome = await createSession(chat, userId, rawName);
      if (outcome.conflict) {
        return reply.status(409).send({ error: 'Session already exists', id: outcome.id, share_url: outcome.share_url });
      }
      return reply.status(201).send({ id: outcome.id, share_url: outcome.share_url });
    },
  );

  // GET /api/sessions/active — return current collecting session for this chat or user
  fastify.get(
    '/api/sessions/active',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const chat = request.telegramChat;
      const userId = request.telegramUser.id;

      let res;
      if (chat) {
        res = await pool.query(
          "SELECT id, name, status FROM sessions WHERE chat_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1",
          [chat.id],
        );
      } else {
        res = await pool.query(
          "SELECT id, name, status FROM sessions WHERE creator_user_id = $1 AND chat_id IS NULL AND status = 'collecting' ORDER BY created_at DESC LIMIT 1",
          [userId],
        );
      }

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

      // Register voter first (voter COUNT depends on this INSERT)
      await pool.query(
        'INSERT INTO session_voters (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId],
      );

      const [optionsRes, voterCount, resultCount, resultsRes] = await Promise.all([
        pool.query('SELECT text FROM options WHERE session_id = $1 ORDER BY created_at', [id]),
        pool.query('SELECT COUNT(*) FROM session_voters WHERE session_id = $1', [id]),
        pool.query('SELECT COUNT(*) FROM user_results WHERE session_id = $1', [id]),
        pool.query('SELECT user_id, ranked_list FROM user_results WHERE session_id = $1', [id]),
      ]);
      const options = optionsRes.rows.map((r: { text: string }) => r.text);
      const borda = computeBorda(resultsRes.rows.map((r: { user_id: number; ranked_list: string[] }) => r.ranked_list));

      // A crash between status flip and sendMessage leaves status='voting' but
      // message_sent=false — surface it as 'collecting' so the UI stays functional.
      // chat_id === null means chatless: no bot message is ever sent, so message_sent
      // stays false by design — must not be treated as a crash recovery case.
      const effectiveStatus =
        session.status === 'voting' && !session.message_sent && session.chat_id !== null
          ? 'collecting' : session.status;

      return {
        id: session.id,
        name: session.name ?? 'Untitled Session',
        status: effectiveStatus,
        options,
        voter_count: parseInt(voterCount.rows[0].count),
        result_count: parseInt(resultCount.rows[0].count),
        borda_ranking: borda,
        my_result: (resultsRes.rows.find((r: { user_id: number; ranked_list: string[] }) => String(r.user_id) === String(userId))?.ranked_list) ?? null,
        share_url: buildVoteUrl(id),
      };
    },
  );

  // GET /api/sessions/:id/winner-card — public PNG of winner announcement (no auth, for inline sharing)
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/winner-card',
    async (request, reply) => {
      const { id } = request.params;

      const sessionRes = await pool.query(
        "SELECT name FROM sessions WHERE id = $1 AND status = 'closed'",
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found or not closed' });
      }

      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );
      if (resultsRes.rows.length === 0) {
        return reply.status(404).send({ error: 'No results' });
      }

      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
      const card = buildWinnerCard(sessionRes.rows[0].name ?? 'Untitled Session', borda);

      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(card.image);
    },
  );

  // GET /api/sessions/:id/voting-card — public PNG of voting card (no auth, for inline sharing)
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/voting-card',
    async (request, reply) => {
      const { id } = request.params;

      const sessionRes = await pool.query(
        "SELECT name, status FROM sessions WHERE id = $1 AND status != 'closed'",
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found or already closed' });
      }

      const optionsRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      const options: string[] = optionsRes.rows.map((r: { text: string }) => r.text);

      const voteUrl = buildVoteUrl(id);
      const card = buildVotingCard(sessionRes.rows[0].name ?? 'Untitled Session', options, 0, 0, voteUrl);

      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'public, max-age=60');
      return reply.send(card.image);
    },
  );

  // GET /api/sessions/:id/options — lightweight poll-friendly options fetch (no voter registration)
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/options',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const sessionRes = await pool.query('SELECT 1 FROM sessions WHERE id = $1', [id]);
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const res = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      return { options: res.rows.map((r: { text: string }) => r.text) };
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
      if (ranked_list.length !== validOptions.size) {
        return reply.status(400).send({ error: `ranked_list must contain all ${validOptions.size} options, got ${ranked_list.length}` });
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

      const [resultsRes, voterCountRes] = await Promise.all([
        pool.query('SELECT ranked_list FROM user_results WHERE session_id = $1', [id]),
        pool.query('SELECT COUNT(*) FROM session_voters WHERE session_id = $1', [id]),
      ]);
      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
      const resultCount = resultsRes.rows.length;
      const totalVoters = parseInt(voterCountRes.rows[0].count);

      if (session.message_id) {
        const caption = buildVotingCaption(resultCount, totalVoters);
        const voteUrl = buildVoteUrl(id);
        bot.api
          .editMessageCaption(session.chat_id, session.message_id, {
            caption,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '▶  ПРОГОЛОСОВАТЬ', url: voteUrl }]] },
          })
          .catch((err: unknown) => console.error('editMessageCaption failed:', err));
      }

      return { borda_ranking: borda, result_count: resultCount, voter_count: totalVoters };
    },
  );

  // PATCH /api/sessions/:id — update session name
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/sessions/:id',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.telegramUser.id;
      const name = (request.body?.name ?? '').trim();
      if (!name) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return reply.status(400).send({ error: 'Name must be 100 characters or fewer' });
      }

      const sessionCheck = await pool.query(
        "SELECT creator_user_id FROM sessions WHERE id = $1 AND status = 'collecting'",
        [id],
      );
      if (sessionCheck.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found or not in collecting state' });
      }
      const { creator_user_id } = sessionCheck.rows[0];
      if (creator_user_id && String(creator_user_id) !== String(userId)) {
        return reply.status(403).send({ error: 'Only the creator can rename this poll' });
      }

      await pool.query("UPDATE sessions SET name = $1 WHERE id = $2 AND status = 'collecting'", [name, id]);
      return { ok: true };
    },
  );

  // POST /api/sessions/:id/options — add option (dedup + limit 32)
  fastify.post<{ Params: { id: string }; Body: { text: string } }>(
    '/api/sessions/:id/options',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const text = (request.body?.text ?? '').trim();

      if (!text) {
        return reply.status(400).send({ error: 'text is required' });
      }
      if (text.length > MAX_OPTION_TEXT_LENGTH) {
        return reply.status(400).send({ error: 'Option text must be 100 characters or fewer' });
      }

      const chat = request.telegramChat;

      const sessionRes = await pool.query(
        'SELECT status, chat_id FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      if (chat && sessionRes.rows[0].chat_id !== chat.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (sessionRes.rows[0].status !== 'collecting') {
        return reply.status(403).send({ error: 'Session is not collecting options' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Lock the session row to serialize concurrent option inserts (TOCTOU guard)
        await client.query('SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE', [id]);

        const countRes = await client.query(
          'SELECT COUNT(*) FROM options WHERE session_id = $1',
          [id],
        );
        if (parseInt(countRes.rows[0].count) >= MAX_OPTIONS) {
          await client.query('ROLLBACK');
          return reply.status(422).send({ error: `Max ${MAX_OPTIONS} options reached` });
        }

        const dupRes = await client.query(
          'SELECT 1 FROM options WHERE session_id = $1 AND LOWER(text) = LOWER($2)',
          [id, text],
        );
        if (dupRes.rows.length > 0) {
          await client.query('ROLLBACK');
          const allRes = await client.query(
            'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
            [id],
          );
          return reply.status(200).send({ options: allRes.rows.map((r: { text: string }) => r.text) });
        }

        await client.query('INSERT INTO options (session_id, text) VALUES ($1, $2)', [id, text]);

        const afterRes = await client.query(
          'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
          [id],
        );
        await client.query('COMMIT');
        return reply.status(201).send({ options: afterRes.rows.map((r: { text: string }) => r.text) });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // DELETE /api/sessions/:id/options/:text — remove an option while still collecting
  fastify.delete<{ Params: { id: string; text: string } }>(
    '/api/sessions/:id/options/:text',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id, text } = request.params;
      const decoded = decodeURIComponent(text).trim();

      const chat = request.telegramChat;

      const userId = request.telegramUser.id;

      const sessionRes = await pool.query(
        'SELECT status, chat_id, creator_user_id FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const sess = sessionRes.rows[0];
      if (chat && sess.chat_id !== chat.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (sess.creator_user_id && String(sess.creator_user_id) !== String(userId)) {
        return reply.status(403).send({ error: 'Only the creator can remove options' });
      }
      if (sess.status !== 'collecting') {
        return reply.status(403).send({ error: 'Session is not collecting options' });
      }

      await pool.query(
        'DELETE FROM options WHERE session_id = $1 AND LOWER(text) = LOWER($2)',
        [id, decoded],
      );

      const allRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      return { options: allRes.rows.map((r: { text: string }) => r.text) };
    },
  );

  // PUT /api/sessions/:id/options — bulk replace (atomic delete + insert in one transaction)
  fastify.put<{ Params: { id: string }; Body: { options: unknown; name?: unknown } }>(
    '/api/sessions/:id/options',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const { options, name } = (request.body ?? {}) as { options: unknown; name?: unknown };

      if (!Array.isArray(options)) {
        return reply.status(400).send({ error: 'options must be an array' });
      }

      const texts = (options as unknown[]).map((o) => String(o ?? '').trim()).filter(Boolean);

      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const t of texts) {
        const key = t.toLowerCase();
        if (!seen.has(key)) { seen.add(key); deduped.push(t); }
      }

      if (deduped.length > MAX_OPTIONS) {
        return reply.status(422).send({ error: `Max ${MAX_OPTIONS} options reached` });
      }
      for (const t of deduped) {
        if (t.length > MAX_OPTION_TEXT_LENGTH) {
          return reply.status(400).send({ error: 'Option text must be 100 characters or fewer' });
        }
      }

      if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (trimmedName.length > MAX_NAME_LENGTH) {
          return reply.status(400).send({ error: 'Name must be 100 characters or fewer' });
        }
      }

      const chat = request.telegramChat;
      const userId = request.telegramUser.id;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const sessionRes = await client.query(
          'SELECT status, chat_id, creator_user_id FROM sessions WHERE id = $1',
          [id],
        );
        if (sessionRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'Session not found' });
        }
        if (chat && sessionRes.rows[0].chat_id !== chat.id) {
          await client.query('ROLLBACK');
          return reply.status(403).send({ error: 'Forbidden' });
        }
        if (sessionRes.rows[0].creator_user_id && String(sessionRes.rows[0].creator_user_id) !== String(userId)) {
          await client.query('ROLLBACK');
          return reply.status(403).send({ error: 'Only the creator can replace options' });
        }
        if (sessionRes.rows[0].status !== 'collecting') {
          await client.query('ROLLBACK');
          return reply.status(403).send({ error: 'Session is not collecting options' });
        }

        if (name !== undefined) {
          const trimmedName = String(name).trim();
          if (trimmedName) {
            await client.query(
              "UPDATE sessions SET name = $1 WHERE id = $2 AND status = 'collecting'",
              [trimmedName, id],
            );
          }
        }

        await client.query('DELETE FROM options WHERE session_id = $1', [id]);

        if (deduped.length > 0) {
          // clock_timestamp() gives each row its own timestamp, preserving insertion order
          const placeholders = deduped.map((_, i) => `($1, $${i + 2}, clock_timestamp())`).join(', ');
          await client.query(
            `INSERT INTO options (session_id, text, created_at) VALUES ${placeholders}`,
            [id, ...deduped],
          );
        }

        const allRes = await client.query(
          'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
          [id],
        );
        await client.query('COMMIT');
        return { options: allRes.rows.map((r: { text: string }) => r.text) };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // POST /api/sessions/:id/vote — flip to voting, send bot message, rollback on failure
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/vote',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;

      const chat = request.telegramChat;

      const sessionRes = await pool.query(
        'SELECT id, name, chat_id, status FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];
      // Enforce ownership only when chat context is available (url-button Mini App
      // launches may not include chat in initData).
      if (chat && session.chat_id !== chat.id) {
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

      // Chatless sessions have no group to announce to — just flip status and return share link.
      if (!session.chat_id) {
        return { ok: true, share_url: buildVoteUrl(id) };
      }

      const miniAppUrl = buildVoteUrl(id);
      const name = session.name ?? 'Untitled Session';

      const optRes = await pool.query(
        'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
        [id],
      );
      const options: string[] = optRes.rows.map((r: { text: string }) => r.text);

      try {
        const card = buildVotingCard(name, options, 0, 0, miniAppUrl);
        const sent = await bot.api.sendPhoto(
          session.chat_id,
          new InputFile(card.image, 'card.png'),
          { caption: card.caption, parse_mode: card.parse_mode, reply_markup: card.reply_markup },
        );
        await pool.query(
          'UPDATE sessions SET message_id = $1, message_sent = true WHERE id = $2',
          [sent.message_id, id],
        );
        return { ok: true };
      } catch (err) {
        // Rollback status on sendMessage failure
        await pool.query("UPDATE sessions SET status = 'collecting' WHERE id = $1", [id]);
        console.error('sendMessage failed:', err);
        return reply.status(502).send({ error: 'Failed to send vote message to group' });
      }
    },
  );

  // POST /api/sessions/:id/close — close session and announce winner in group
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/close',
    { preHandler: initDataMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.telegramUser.id;

      const sessionRes = await pool.query(
        'SELECT id, name, chat_id, creator_user_id, status FROM sessions WHERE id = $1',
        [id],
      );
      if (sessionRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      const session = sessionRes.rows[0];
      if (session.status !== 'voting') {
        return reply.status(409).send({ error: 'Session is not in voting state' });
      }

      // pg returns BIGINT as string — compare via String() to avoid type mismatch.
      if (session.creator_user_id && String(session.creator_user_id) !== String(userId)) {
        return reply.status(403).send({ error: 'Only the creator can close this poll' });
      }

      await pool.query("UPDATE sessions SET status = 'closed' WHERE id = $1", [id]);

      const resultsRes = await pool.query(
        'SELECT ranked_list FROM user_results WHERE session_id = $1',
        [id],
      );

      if (resultsRes.rows.length === 0) {
        return { ok: true, winner: null };
      }

      const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
      const sessionName = session.name ?? 'Untitled Session';
      const card = buildWinnerCard(sessionName, borda);

      if (session.chat_id) {
        bot.api
          .sendPhoto(session.chat_id, new InputFile(card.image, 'winner.png'), {
            caption: card.caption,
            parse_mode: card.parse_mode,
          })
          .catch((err: unknown) => console.error('close announcement failed:', err));
      }

      return { ok: true, winner: borda[0].option };
    },
  );
}

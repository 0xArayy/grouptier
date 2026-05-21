import { Bot, InputFile } from 'grammy';
import type { InlineQueryResultArticle, InlineQueryResultPhoto } from 'grammy/types';
import { pool } from '../db/client.js';
import { computeBorda } from '../db/borda.js';
import { buildVoteUrl } from '../lib/urls.js';
import { buildSetupCard, buildVotingCard, buildWinnerCard } from './cards.js';

const MAX_OPTIONS = 32;

export const bot = new Bot(process.env.BOT_TOKEN ?? '');

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Primary flow: /newpoll → Mini App (CreatePoll → OptionsStep → LiveResults)
bot.command('newpoll', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    return ctx.reply('Use /newpoll in a group chat.');
  }

  const existing = await pool.query(
    "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
    [ctx.chat.id],
  );
  let sessionId: string;
  if (existing.rows.length > 0) {
    sessionId = existing.rows[0].id;
  } else {
    const res = await pool.query(
      "INSERT INTO sessions (chat_id, name, status) VALUES ($1, 'Untitled Poll', 'collecting') RETURNING id",
      [ctx.chat.id],
    );
    sessionId = res.rows[0].id;
  }

  const manageUrl = buildVoteUrl(sessionId);
  const card = buildSetupCard(manageUrl);
  await ctx.replyWithPhoto(new InputFile(card.image, 'card.png'), {
    reply_markup: card.reply_markup,
  });
});

// LEGACY — superseded by /newpoll flow
bot.command('startsession', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    return ctx.reply('Use /startsession in a group chat.');
  }
  const name = ctx.match?.trim() || 'Untitled Session';

  const existing = await pool.query(
    "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
    [ctx.chat.id],
  );
  if (existing.rows.length > 0) {
    return ctx.reply('There is already an active session in this group. Use /newpoll to manage it.');
  }

  const res = await pool.query(
    `INSERT INTO sessions (chat_id, name, status)
     VALUES ($1, $2, 'collecting')
     RETURNING id`,
    [ctx.chat.id, name],
  );
  const sessionId: string = res.rows[0].id;

  await ctx.reply(
    `📋 New session: *${name}*\n\nAdd options with /addoption <text>. Up to 32 options.\nAdmin starts voting with /vote.\n\nSession ID: \`${sessionId}\``,
    { parse_mode: 'Markdown' },
  );
});

// LEGACY — superseded by /newpoll flow
bot.command('addoption', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const text = ctx.match?.trim();
  if (!text) return ctx.reply('Usage: /addoption <option text>');

  const sessionRes = await pool.query(
    `SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1`,
    [ctx.chat.id],
  );
  if (sessionRes.rows.length === 0) {
    return ctx.reply('No active session. Start one with /startsession.');
  }
  const sessionId: string = sessionRes.rows[0].id;

  const countRes = await pool.query(
    'SELECT COUNT(*) FROM options WHERE session_id = $1',
    [sessionId],
  );
  if (parseInt(countRes.rows[0].count) >= MAX_OPTIONS) {
    return ctx.reply(`Max ${MAX_OPTIONS} options reached.`);
  }

  const dupRes = await pool.query(
    'SELECT 1 FROM options WHERE session_id = $1 AND LOWER(text) = LOWER($2)',
    [sessionId, text],
  );
  if (dupRes.rows.length > 0) {
    return ctx.reply(`"${text}" is already in the list.`);
  }

  await pool.query('INSERT INTO options (session_id, text) VALUES ($1, $2)', [sessionId, text]);

  const allRes = await pool.query(
    'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
    [sessionId],
  );
  const list = allRes.rows.map((r: { text: string }, i: number) => `${i + 1}. ${r.text}`).join('\n');
  await ctx.reply(`✅ Added! Current options:\n${list}`);
});

// LEGACY — superseded by /newpoll flow
bot.command('vote', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;

  const sessionRes = await pool.query(
    `SELECT id, name FROM sessions WHERE chat_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1`,
    [ctx.chat.id],
  );
  if (sessionRes.rows.length === 0) {
    return ctx.reply('No active session in collecting mode. Start one with /startsession.');
  }
  const session = sessionRes.rows[0];

  const countRes = await pool.query(
    'SELECT COUNT(*) FROM options WHERE session_id = $1',
    [session.id],
  );
  if (parseInt(countRes.rows[0].count) < 2) {
    return ctx.reply('Need at least 2 options. Add more with /addoption.');
  }

  await pool.query(`UPDATE sessions SET status = 'voting' WHERE id = $1`, [session.id]);

  const miniAppUrl = buildVoteUrl(session.id);
  const name = session.name ?? 'Untitled Session';

  const optRes = await pool.query(
    'SELECT text FROM options WHERE session_id = $1 ORDER BY created_at',
    [session.id],
  );
  const options: string[] = optRes.rows.map((r: { text: string }) => r.text);

  let sent;
  try {
    const card = buildVotingCard(name, options, 0, 0, miniAppUrl);
    sent = await ctx.replyWithPhoto(new InputFile(card.image, 'card.png'), {
      caption: card.caption,
      parse_mode: card.parse_mode,
      reply_markup: card.reply_markup,
    });
  } catch (err) {
    await pool.query(`UPDATE sessions SET status = 'collecting' WHERE id = $1`, [session.id]);
    console.error('/vote reply failed:', err);
    await ctx.reply('❌ Failed to open voting. Check server logs.');
    return;
  }

  await pool.query('UPDATE sessions SET message_id = $1, message_sent = true WHERE id = $2', [
    sent.message_id,
    session.id,
  ]);
});

// LEGACY — superseded by /newpoll flow
bot.command('closesession', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;

  const res = await pool.query(
    `UPDATE sessions SET status = 'closed'
     WHERE id = (
       SELECT id FROM sessions
       WHERE chat_id = $1 AND status = 'voting'
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING id, name`,
    [ctx.chat.id],
  );

  if (res.rows.length === 0) {
    return ctx.reply('No open voting session found.');
  }
  const { id: sessionId, name } = res.rows[0];

  const resultsRes = await pool.query(
    'SELECT ranked_list FROM user_results WHERE session_id = $1',
    [sessionId],
  );

  if (resultsRes.rows.length === 0) {
    return ctx.reply('No votes recorded — session closed.');
  }

  const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
  const sessionName = name ?? 'Untitled Session';
  const card = buildWinnerCard(sessionName, borda);
  await ctx.replyWithPhoto(new InputFile(card.image, 'winner.png'), {
    caption: card.caption,
    parse_mode: card.parse_mode,
  });
});

// Noop handler for display-only option grid buttons (answer all to prevent Telegram spinner timeout)
bot.on('callback_query:data', async (ctx) => {
  await ctx.answerCallbackQuery();
});

// inline query — three modes:
//   <sessionId>:winner  → share winner announcement card (photo, closed session)
//   <sessionId>         → share voting card (photo, open session) or personal tier list (article, voted)
bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query;
  const parts = query.split(':');
  if (parts.length < 1 || !parts[0]) {
    return ctx.answerInlineQuery([]);
  }
  const sessionId = parts[0];
  const mode = parts[1]; // 'winner' or undefined

  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '')
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : null);

  // ── Winner card mode ────────────────────────────────────────────────────
  if (mode === 'winner') {
    if (!serverUrl) return ctx.answerInlineQuery([]);

    const [sessionRes, resultsRes] = await Promise.all([
      pool.query("SELECT name FROM sessions WHERE id = $1 AND status = 'closed'", [sessionId]),
      pool.query('SELECT ranked_list FROM user_results WHERE session_id = $1', [sessionId]),
    ]);
    if (sessionRes.rows.length === 0 || resultsRes.rows.length === 0) {
      return ctx.answerInlineQuery([]);
    }

    const sessionName = sessionRes.rows[0].name ?? 'Untitled Session';
    const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
    const medals = ['🥇', '🥈', '🥉'];
    const caption = borda.slice(0, 3).map((r, i) => `${medals[i]} ${r.option}`).join('\n');
    const photoUrl = `${serverUrl}/api/sessions/${sessionId}/winner-card`;

    const result: InlineQueryResultPhoto = {
      type: 'photo',
      id: `winner-${sessionId}`,
      photo_url: photoUrl,
      thumbnail_url: photoUrl,
      title: sessionName,
      caption,
    };

    return ctx.answerInlineQuery([result], { cache_time: 300 });
  }

  // ── Voting card or personal tier list mode ──────────────────────────────
  const requesterId = ctx.from.id;

  const [sessionRes, resResult] = await Promise.all([
    pool.query('SELECT name, status FROM sessions WHERE id = $1', [sessionId]),
    pool.query('SELECT ranked_list FROM user_results WHERE session_id = $1 AND user_id = $2', [sessionId, requesterId]),
  ]);
  if (sessionRes.rows.length === 0) return ctx.answerInlineQuery([]);

  const sessionName = sessionRes.rows[0].name ?? 'Untitled Session';
  const sessionStatus: string = sessionRes.rows[0].status;

  // Open session → share voting card photo so others can tap in and vote
  if (sessionStatus === 'voting') {
    if (!serverUrl) return ctx.answerInlineQuery([]);
    const photoUrl = `${serverUrl}/api/sessions/${sessionId}/voting-card`;
    const voteUrl = buildVoteUrl(sessionId);

    const result: InlineQueryResultPhoto = {
      type: 'photo',
      id: `vote-${sessionId}`,
      photo_url: photoUrl,
      thumbnail_url: photoUrl,
      title: sessionName,
      caption: '',
      reply_markup: { inline_keyboard: [[{ text: '▶  ПРОГОЛОСОВАТЬ', url: voteUrl }]] },
    };
    return ctx.answerInlineQuery([result], { cache_time: 30 });
  }

  // Closed session + user has voted → share personal tier list article
  if (resResult.rows.length === 0) {
    return ctx.answerInlineQuery([]);
  }
  const rankedList: string[] = resResult.rows[0].ranked_list;

  const tierSize = Math.ceil(rankedList.length / 4);
  const tiers = ['S', 'A', 'B', 'C'];
  const lines = tiers
    .map((tier, i) => {
      const chunk = rankedList.slice(i * tierSize, (i + 1) * tierSize);
      return chunk.length ? `${tier}: ${chunk.join(', ')}` : null;
    })
    .filter(Boolean);

  const text = `My GroupTier picks for ${sessionName}:\n${lines.join('\n')}`;

  const result: InlineQueryResultArticle = {
    type: 'article',
    id: 'tier-list',
    title: `My picks for ${sessionName}`,
    description: text.slice(0, 80),
    input_message_content: { message_text: text },
  };

  await ctx.answerInlineQuery([result]);
});

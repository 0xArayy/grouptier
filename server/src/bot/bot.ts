import { Bot } from 'grammy';
import type { InlineQueryResultArticle } from 'grammy/types';
import { pool } from '../db/client.js';
import { computeBorda } from '../db/borda.js';

export const bot = new Bot(process.env.BOT_TOKEN ?? '');

bot.catch((err) => {
  console.error('Bot error:', err);
});

// /startsession [name]
bot.command('startsession', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    return ctx.reply('Use /startsession in a group chat.');
  }
  const name = ctx.match?.trim() || 'Untitled Session';

  const res = await pool.query(
    `INSERT INTO sessions (chat_id, name, status)
     VALUES ($1, $2, 'collecting')
     RETURNING id`,
    [ctx.chat.id, name],
  );
  const sessionId: string = res.rows[0].id;

  await ctx.reply(
    `📋 New session: *${name}*\n\nAdd options with /addoption <text>. Up to 12 options.\nAdmin starts voting with /vote.\n\nSession ID: \`${sessionId}\``,
    { parse_mode: 'Markdown' },
  );
});

// /addoption <text>
bot.command('addoption', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const text = ctx.match?.trim();
  if (!text) return ctx.reply('Usage: /addoption <option text>');

  // Find most recent collecting session for this chat
  const sessionRes = await pool.query(
    `SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1`,
    [ctx.chat.id],
  );
  if (sessionRes.rows.length === 0) {
    return ctx.reply('No active session. Start one with /startsession.');
  }
  const sessionId: string = sessionRes.rows[0].id;

  // Check limit
  const countRes = await pool.query(
    'SELECT COUNT(*) FROM options WHERE session_id = $1',
    [sessionId],
  );
  if (parseInt(countRes.rows[0].count) >= 12) {
    return ctx.reply('Max 12 options reached.');
  }

  // Check duplicate (case-insensitive)
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

// /vote — lock options and send Mini App link
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

  // Require at least 2 options
  const countRes = await pool.query(
    'SELECT COUNT(*) FROM options WHERE session_id = $1',
    [session.id],
  );
  if (parseInt(countRes.rows[0].count) < 2) {
    return ctx.reply('Need at least 2 options. Add more with /addoption.');
  }

  await pool.query(`UPDATE sessions SET status = 'voting' WHERE id = $1`, [session.id]);

  const miniAppUrl = `${process.env.MINI_APP_URL}?session_id=${session.id}`;
  const name = session.name ?? 'Untitled Session';

  let sent;
  try {
    // CP5: send message with inline keyboard
    sent = await ctx.reply(
      `🗳️ Voting open for *${name}*!\n\n0 of 0 voted`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🗳️ Cast your vote →', web_app: { url: miniAppUrl } }]],
        },
      },
    );
  } catch (err) {
    console.error('/vote reply failed:', err);
    await ctx.reply('❌ Failed to open voting. Check server logs.');
    return;
  }

  // Store message_id for CP1 edits
  await pool.query('UPDATE sessions SET message_id = $1 WHERE id = $2', [
    sent.message_id,
    session.id,
  ]);
});

// /closesession — announce winner
bot.command('closesession', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;

  // Atomic update — prevents race condition
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

  // Fetch results for winner announcement
  const resultsRes = await pool.query(
    'SELECT ranked_list FROM user_results WHERE session_id = $1',
    [sessionId],
  );

  if (resultsRes.rows.length === 0) {
    return ctx.reply('No votes recorded — session closed.');
  }

  const borda = computeBorda(resultsRes.rows.map((r: { ranked_list: string[] }) => r.ranked_list));
  const sessionName = name ?? 'Untitled Session';
  const ranking = borda
    .map((r, i) => `${i + 1}. ${r.option} — ${r.score} pts`)
    .join('\n');

  await ctx.reply(
    `🏆 *${sessionName}* winner: *${borda[0].option}*!\n\nFull group ranking:\n${ranking}`,
    { parse_mode: 'Markdown' },
  );
});

// CP4: inline query — share personal tier list
bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query;
  const parts = query.split(':');
  if (parts.length < 1 || !parts[0]) {
    return ctx.answerInlineQuery([]);
  }
  const sessionId = parts[0];
  const requesterId = ctx.from.id; // Use actual sender, not spoofable query param

  const resResult = await pool.query(
    'SELECT ranked_list FROM user_results WHERE session_id = $1 AND user_id = $2',
    [sessionId, requesterId],
  );
  if (resResult.rows.length === 0) {
    return ctx.answerInlineQuery([]);
  }

  const sessionRes = await pool.query('SELECT name FROM sessions WHERE id = $1', [sessionId]);
  const sessionName = sessionRes.rows[0]?.name ?? 'Untitled Session';
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

import { Bot, InputFile } from 'grammy';
import type { InlineQueryResultArticle, InlineQueryResultPhoto } from 'grammy/types';
import { computeBorda } from '../db/borda.js';
import { pool } from '../db/client.js';
import { createSession } from '../lib/sessions.js';
import { buildVoteUrl } from '../lib/urls.js';
import { buildSetupCard } from './cards.js';

export const bot = new Bot(process.env.BOT_TOKEN ?? '');

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Primary flow: /newpoll → Mini App (CreatePoll → OptionsStep → LiveResults)
bot.command('newpoll', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    return ctx.reply('Use /newpoll in a group chat.');
  }

  const userId = ctx.from?.id ?? 0;
  const outcome = await createSession(ctx.chat, userId, 'Untitled Poll');
  // outcome.conflict means a collecting session already exists — reuse it
  const sessionId = outcome.id;

  const manageUrl = buildVoteUrl(sessionId);
  const card = await buildSetupCard(manageUrl);
  await ctx.replyWithPhoto(new InputFile(card.image, 'card.png'), {
    reply_markup: card.reply_markup,
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

  const serverUrl =
    process.env.SERVER_URL?.replace(/\/$/, '') ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

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
    const caption = borda
      .slice(0, 3)
      .map((r, i) => `${medals[i]} ${r.option}`)
      .join('\n');
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
    pool.query('SELECT ranked_list FROM user_results WHERE session_id = $1 AND user_id = $2', [
      sessionId,
      requesterId,
    ]),
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

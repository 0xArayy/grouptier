import { generateVotingCardAsync, generateSetupCardAsync, generateWinnerCardAsync } from './imageCard.js';
import type { BordaResult } from '../db/borda.js';

export type { BordaResult };

// ── Emoji mapping ────────────────────────────────────────────────────────────

const EMOJI_KEYWORDS: [string, string][] = [
  ['pizza', '🍕'], ['пицца', '🍕'],
  ['burger', '🍔'], ['бургер', '🍔'], ['hamburger', '🍔'],
  ['sushi', '🍱'], ['суши', '🍱'],
  ['ramen', '🍜'], ['рамен', '🍜'], ['noodle', '🍜'], ['лапша', '🍜'],
  ['pasta', '🍝'], ['паста', '🍝'], ['спагетти', '🍝'],
  ['taco', '🌮'],
  ['sandwich', '🥪'], ['сэндвич', '🥪'], ['бутерброд', '🥪'],
  ['salad', '🥗'], ['салат', '🥗'],
  ['soup', '🍲'], ['суп', '🍲'], ['борщ', '🍲'],
  ['chicken', '🍗'], ['курица', '🍗'],
  ['fish', '🐟'], ['рыба', '🐟'],
  ['roll', '🍣'], ['ролл', '🍣'],
  ['steak', '🥩'], ['стейк', '🥩'], ['beef', '🥩'], ['мясо', '🥩'],
  ['bbq', '🍖'], ['шашлык', '🍖'], ['grill', '🍖'],
  ['beer', '🍺'], ['пиво', '🍺'],
  ['coffee', '☕'], ['кофе', '☕'],
  ['tea', '🍵'], ['чай', '🍵'],
  ['wine', '🍷'], ['вино', '🍷'],
  ['cake', '🎂'], ['торт', '🎂'],
  ['ice', '🍦'], ['мороженое', '🍦'],
  ['movie', '🎬'], ['кино', '🎬'], ['film', '🎬'], ['фильм', '🎬'],
  ['music', '🎵'], ['музыка', '🎵'], ['concert', '🎵'], ['концерт', '🎵'],
  ['game', '🎮'], ['игра', '🎮'],
  ['football', '⚽'], ['soccer', '⚽'], ['футбол', '⚽'],
  ['basketball', '🏀'], ['баскетбол', '🏀'],
  ['tennis', '🎾'], ['теннис', '🎾'],
  ['sport', '🏃'], ['спорт', '🏃'],
  ['beach', '🏖️'], ['пляж', '🏖️'],
  ['park', '🌳'], ['парк', '🌳'],
  ['gym', '💪'], ['зал', '💪'],
  ['book', '📚'], ['книга', '📚'],
  ['travel', '✈️'], ['путешест', '✈️'],
  ['bar', '🍹'], ['бар', '🍹'],
  ['curry', '🍛'], ['карри', '🍛'],
  ['rice', '🍚'], ['рис', '🍚'],
];

const FALLBACK_BULLETS = [
  '🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⬜',
  '🔷','🔶','🔹','🔸','🔺','🔻',
];

/** Exported for unit tests in cards.test.ts */
export function optionEmoji(text: string, index: number): string {
  const lower = text.toLowerCase();
  for (const [kw, emoji] of EMOJI_KEYWORDS) {
    if (lower.includes(kw)) return emoji;
  }
  return FALLBACK_BULLETS[index % FALLBACK_BULLETS.length];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type UrlBtn = { text: string; url: string };

// ── Caption builders (used in sendPhoto / editMessageCaption) ─────────────────

export function buildVotingCaption(voted: number, total: number): string {
  if (total === 0) return `👥 Ожидаем участников…`;
  const v = Math.trunc(voted) || 0;
  const t = Math.trunc(total) || 0;
  const pct = t === 0 ? 0 : Math.round((v / t) * 100);
  return `👥 <b>${v}</b> из ${t} проголосовали · ${pct}%`;
}

// ── Full card builders ────────────────────────────────────────────────────────

export async function buildVotingCard(
  name: string,
  options: string[],
  voted: number,
  total: number,
  voteUrl: string,
): Promise<{
  image: Buffer;
  caption: string;
  parse_mode: 'HTML';
  reply_markup: { inline_keyboard: UrlBtn[][] };
}> {
  const image   = await generateVotingCardAsync(name, options.length);
  const voteBtn: UrlBtn = { text: '▶  ПРОГОЛОСОВАТЬ', url: voteUrl };
  return {
    image,
    caption: buildVotingCaption(voted, total),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[voteBtn]] },
  };
}

export async function buildSetupCard(voteUrl: string): Promise<{
  image: Buffer;
  reply_markup: { inline_keyboard: UrlBtn[][] };
}> {
  return {
    image: await generateSetupCardAsync(),
    reply_markup: {
      inline_keyboard: [[{ text: '⚙️  НАСТРОИТЬ ОПРОС', url: voteUrl }]],
    },
  };
}

export async function buildWinnerCard(name: string, borda: BordaResult[]): Promise<{
  image: Buffer;
  caption: string;
  parse_mode: 'HTML';
}> {
  if (borda.length === 0) throw new Error('buildWinnerCard: empty borda results');
  const medals = ['🥇', '🥈', '🥉'];
  const lines = borda.slice(0, 3).map((r, i) =>
    `${medals[i]} <b>${escapeHtml(r.option)}</b>`,
  );
  return {
    image:   await generateWinnerCardAsync(name, borda[0].option),
    caption: lines.join('\n'),
    parse_mode: 'HTML',
  };
}

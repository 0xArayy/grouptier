import { generateVotingCard, generateSetupCard, generateWinnerCard } from './imageCard.js';

export interface BordaResult {
  option: string;
  score: number;
}

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

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Inline keyboard builders ─────────────────────────────────────────────────

type DisplayBtn = { text: string; callback_data: string };
type UrlBtn     = { text: string; url: string };

const MAX_GRID_COLS = 4;
const GRID_LABEL_MAX_CHARS = 9; // fits within Telegram inline button width at 4 columns

function buildOptionsGrid(options: string[]): DisplayBtn[][] {
  const cols = options.length <= MAX_GRID_COLS ? options.length : MAX_GRID_COLS;
  const rows: DisplayBtn[][] = [];
  for (let i = 0; i < options.length; i += cols) {
    rows.push(
      options.slice(i, i + cols).map((opt, j) => ({
        text: `${optionEmoji(opt, i + j)} ${truncate(opt, GRID_LABEL_MAX_CHARS)}`,
        callback_data: '_',
      })),
    );
  }
  return rows;
}

// ── Caption builders (used in sendPhoto / editMessageCaption) ─────────────────

export function buildVotingCaption(voted: number, total: number): string {
  if (total === 0) return `👥 Ожидаем участников…`;
  const v = Math.trunc(voted) || 0;
  const t = Math.trunc(total) || 0;
  const pct = t === 0 ? 0 : Math.round((v / t) * 100);
  return `👥 <b>${v}</b> из ${t} проголосовали · ${pct}%`;
}

// ── Full card builders ────────────────────────────────────────────────────────

export function buildVotingCard(
  name: string,
  options: string[],
  voted: number,
  total: number,
  voteUrl: string,
): {
  image: Buffer;
  caption: string;
  parse_mode: 'HTML';
  reply_markup: { inline_keyboard: (DisplayBtn | UrlBtn)[][] };
} {
  const image   = generateVotingCard(name, options.length);
  const grid    = buildOptionsGrid(options);
  const voteBtn: UrlBtn = { text: '▶  ПРОГОЛОСОВАТЬ', url: voteUrl };
  return {
    image,
    caption: buildVotingCaption(voted, total),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [...grid, [voteBtn]] },
  };
}

export function buildSetupCard(voteUrl: string): {
  image: Buffer;
  reply_markup: { inline_keyboard: UrlBtn[][] };
} {
  return {
    image: generateSetupCard(),
    reply_markup: {
      inline_keyboard: [[{ text: '⚙️  НАСТРОИТЬ ГОЛОС', url: voteUrl }]],
    },
  };
}

export function buildWinnerCard(name: string, borda: BordaResult[]): {
  image: Buffer;
  caption: string;
  parse_mode: 'HTML';
} {
  if (borda.length === 0) throw new Error('buildWinnerCard: empty borda results');
  const medals = ['🥇', '🥈', '🥉'];
  const lines = borda.slice(0, 5).map((r, i) =>
    i < 3
      ? `${medals[i]} <b>${escapeHtml(r.option)}</b>`
      : `${i + 1}. ${escapeHtml(r.option)}`,
  );
  return {
    image:   generateWinnerCard(name, borda[0].option),
    caption: lines.join('\n'),
    parse_mode: 'HTML',
  };
}

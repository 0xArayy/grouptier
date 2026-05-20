import { describe, it, expect } from 'vitest';
import {
  buildVotingCaption,
  buildVotingCard,
  buildSetupCard,
  buildWinnerCard,
  optionEmoji,
} from '../bot/cards.js';

// ── buildVotingCaption ────────────────────────────────────────────────────

describe('buildVotingCaption', () => {
  it('returns waiting string when total is 0', () => {
    expect(buildVotingCaption(0, 0)).toBe('👥 Ожидаем участников…');
  });

  it('0 of N voted — 0%', () => {
    const result = buildVotingCaption(0, 5);
    expect(result).toContain('0');
    expect(result).toContain('5');
    expect(result).toContain('0%');
  });

  it('partial votes — correct percentage', () => {
    const result = buildVotingCaption(3, 5);
    expect(result).toContain('3');
    expect(result).toContain('5');
    expect(result).toContain('60%');
  });

  it('all voted — 100%', () => {
    const result = buildVotingCaption(7, 7);
    expect(result).toContain('100%');
  });

  it('rounds percentage to nearest integer', () => {
    // 1/3 ≈ 33.3% → rounds to 33%
    expect(buildVotingCaption(1, 3)).toContain('33%');
  });

  it('wraps voted count in <b> HTML tag', () => {
    const result = buildVotingCaption(4, 10);
    expect(result).toContain('<b>4</b>');
  });
});

// ── buildWinnerCard ───────────────────────────────────────────────────────

describe('buildWinnerCard', () => {
  const fakeBorda = [
    { option: 'Alpha', score: 10 },
    { option: 'Beta', score: 8 },
    { option: 'Gamma', score: 6 },
    { option: 'Delta', score: 4 },
    { option: 'Epsilon', score: 2 },
    { option: 'Zeta', score: 1 },
  ];

  it('throws on empty borda array', () => {
    expect(() => buildWinnerCard('Test Poll', [])).toThrow();
  });

  it('returns image Buffer, caption string, HTML parse_mode', () => {
    const card = buildWinnerCard('Test Poll', fakeBorda);
    expect(card.image).toBeInstanceOf(Buffer);
    expect(card.image.length).toBeGreaterThan(0);
    expect(typeof card.caption).toBe('string');
    expect(card.parse_mode).toBe('HTML');
  });

  it('first place gets gold medal', () => {
    const { caption } = buildWinnerCard('Poll', fakeBorda);
    expect(caption).toContain('🥇');
    expect(caption).toContain('Alpha');
  });

  it('top-3 get medals, 4th+ get numbered lines', () => {
    const { caption } = buildWinnerCard('Poll', fakeBorda);
    expect(caption).toContain('🥈');
    expect(caption).toContain('🥉');
    expect(caption).toContain('4. Delta');
    expect(caption).toContain('5. Epsilon');
  });

  it('caps output at top 5 entries', () => {
    const { caption } = buildWinnerCard('Poll', fakeBorda);
    expect(caption).not.toContain('Zeta'); // 6th entry should be omitted
  });

  it('HTML-escapes special chars in option names', () => {
    const borda = [{ option: '<script>alert(1)</script>', score: 5 }];
    const { caption } = buildWinnerCard('Poll', borda);
    expect(caption).not.toContain('<script>');
    expect(caption).toContain('&lt;script&gt;');
  });

  it('handles single-option borda (only 🥇)', () => {
    const single = [{ option: 'Solo', score: 5 }];
    const { caption } = buildWinnerCard('Poll', single);
    expect(caption).toContain('🥇');
    expect(caption).not.toContain('🥈');
  });

  it('wraps winner option in <b> HTML', () => {
    const { caption } = buildWinnerCard('Poll', fakeBorda);
    expect(caption).toContain('<b>Alpha</b>');
  });
});

// ── buildSetupCard ────────────────────────────────────────────────────────

describe('buildSetupCard', () => {
  it('returns image Buffer and reply_markup with the given URL', () => {
    const card = buildSetupCard('https://t.me/grouptier_bot/vote');
    expect(card.image).toBeInstanceOf(Buffer);
    expect(card.image.length).toBeGreaterThan(0);
    expect(card.reply_markup.inline_keyboard[0][0].url).toBe('https://t.me/grouptier_bot/vote');
  });
});

// ── buildVotingCard ───────────────────────────────────────────────────────

describe('buildVotingCard', () => {
  const options = ['Pizza', 'Sushi', 'Burger'];

  it('returns image, caption, HTML parse_mode, and reply_markup', () => {
    const card = buildVotingCard('Lunch', options, 0, 0, 'https://t.me/test');
    expect(card.image).toBeInstanceOf(Buffer);
    expect(card.image.length).toBeGreaterThan(0);
    expect(card.parse_mode).toBe('HTML');
    expect(typeof card.caption).toBe('string');
  });

  it('includes a vote URL button as the last keyboard row', () => {
    const card = buildVotingCard('Lunch', options, 0, 0, 'https://t.me/test');
    const rows = card.reply_markup.inline_keyboard;
    const lastRow = rows[rows.length - 1];
    expect(lastRow[0]).toMatchObject({ url: 'https://t.me/test' });
  });

  it('≤4 options → single grid row with all options', () => {
    const threeOpts = ['A', 'B', 'C'];
    const card = buildVotingCard('Test', threeOpts, 0, 0, 'https://t.me/test');
    // grid rows + vote button row
    const gridRows = card.reply_markup.inline_keyboard.slice(0, -1);
    expect(gridRows).toHaveLength(1);
    expect(gridRows[0]).toHaveLength(3);
  });

  it('>4 options → grid rows of max 4 columns', () => {
    const sixOpts = ['A', 'B', 'C', 'D', 'E', 'F'];
    const card = buildVotingCard('Test', sixOpts, 0, 0, 'https://t.me/test');
    const gridRows = card.reply_markup.inline_keyboard.slice(0, -1);
    gridRows.forEach((row) => expect(row.length).toBeLessThanOrEqual(4));
  });

  it('caption reflects waiting state when total=0', () => {
    const card = buildVotingCard('Test', options, 0, 0, 'https://t.me/test');
    expect(card.caption).toContain('Ожидаем');
  });

  it('caption shows vote progress when total>0', () => {
    const card = buildVotingCard('Test', options, 2, 5, 'https://t.me/test');
    expect(card.caption).toContain('2');
    expect(card.caption).toContain('5');
  });
});

// ── optionEmoji (re-exported for testing) ─────────────────────────────────

describe('optionEmoji', () => {
  it('matches English food keywords', () => {
    expect(optionEmoji('pizza margherita', 0)).toBe('🍕');
    expect(optionEmoji('burger king', 0)).toBe('🍔');
    expect(optionEmoji('sushi bar', 0)).toBe('🍱');
  });

  it('matches Russian food keywords', () => {
    expect(optionEmoji('пицца с сыром', 0)).toBe('🍕');
    expect(optionEmoji('суши ресторан', 0)).toBe('🍱');
  });

  it('falls back to bullet when no keyword matches', () => {
    const emoji = optionEmoji('option with no keyword', 0);
    expect(emoji).toBeTruthy();
    expect(emoji.length).toBeGreaterThan(0);
  });

  it('wraps bullet index with modulo (index >= FALLBACK_BULLETS.length)', () => {
    // FALLBACK_BULLETS has 15 entries — index 15 should wrap to index 0
    const first = optionEmoji('no keyword', 0);
    const wrapped = optionEmoji('no keyword', 15);
    expect(first).toBe(wrapped);
  });
});

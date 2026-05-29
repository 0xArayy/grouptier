import { afterEach, describe, expect, it } from 'vitest';
import { buildVoteUrl } from '../lib/urls.js';

describe('buildVoteUrl', () => {
  const SESSION_ID = '00000000-0000-0000-0000-000000000001';
  const original = process.env.MINI_APP_TGLINK;

  afterEach(() => {
    process.env.MINI_APP_TGLINK = original;
  });

  it('returns url with ?startapp= query param', () => {
    process.env.MINI_APP_TGLINK = 'https://t.me/MyBot/app';
    expect(buildVoteUrl(SESSION_ID)).toBe(`https://t.me/MyBot/app?startapp=${SESSION_ID}`);
  });

  it('strips trailing slash from MINI_APP_TGLINK', () => {
    process.env.MINI_APP_TGLINK = 'https://t.me/MyBot/app/';
    expect(buildVoteUrl(SESSION_ID)).toBe(`https://t.me/MyBot/app?startapp=${SESSION_ID}`);
  });

  it('handles empty MINI_APP_TGLINK gracefully', () => {
    process.env.MINI_APP_TGLINK = '';
    expect(buildVoteUrl(SESSION_ID)).toBe(`?startapp=${SESSION_ID}`);
  });

  it('handles undefined MINI_APP_TGLINK gracefully', () => {
    delete process.env.MINI_APP_TGLINK;
    expect(buildVoteUrl(SESSION_ID)).toBe(`?startapp=${SESSION_ID}`);
  });
});

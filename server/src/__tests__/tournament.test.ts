import { describe, it, expect } from 'vitest';
import { createTournament, pick, buildRankedList } from '../lib/tournament.js';

describe('createTournament', () => {
  it('N=2 — 1 matchup, no byes', () => {
    const t = createTournament(['A', 'B'], 1);
    expect(t.totalMatchups).toBe(1);
    expect(t.rounds[0]).toHaveLength(1);
    expect(t.rounds[0][0].isBye).toBe(false);
  });

  it('N=3 — 2 matchups (1 bye in round 1)', () => {
    const t = createTournament(['A', 'B', 'C'], 1);
    expect(t.totalMatchups).toBe(2);
    const hasBye = t.rounds[0].some(m => m.isBye);
    expect(hasBye).toBe(true);
  });

  it('N=5 — 4 matchups total', () => {
    const t = createTournament(['A', 'B', 'C', 'D', 'E'], 42);
    expect(t.totalMatchups).toBe(4);
  });

  it('N=12 — 11 matchups total', () => {
    const t = createTournament(Array.from({ length: 12 }, (_, i) => `opt${i}`), 1);
    expect(t.totalMatchups).toBe(11);
  });

  it('different seeds give different orderings', () => {
    const opts = ['A', 'B', 'C', 'D'];
    const t1 = createTournament(opts, 1);
    const t2 = createTournament(opts, 999);
    const order1 = t1.rounds[0].map(m => m.optionA);
    const order2 = t2.rounds[0].map(m => m.optionA);
    // With 4 options there are 3 possible first-round pairings; seeds are unlikely to match
    expect(order1.join(',')).not.toBe(order2.join(','));
  });
});

describe('pick + buildRankedList', () => {
  it('N=2 — picking winner produces champion and ranked list', () => {
    const t = createTournament(['A', 'B'], 1);
    const matchup = t.rounds[0][0];
    const final = pick(t, matchup.optionA, matchup.optionB);
    expect(final.champion).toBe(matchup.optionA);

    const ranked = buildRankedList(final);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toBe(matchup.optionA);
  });

  it('N=3 full tournament completes in 2 picks', () => {
    const opts = ['A', 'B', 'C'];
    let t = createTournament(opts, 1);

    let picks = 0;
    while (!t.champion) {
      const matchup = t.rounds[t.currentRound][t.currentMatchup];
      if (matchup.isBye) {
        t = pick(t, matchup.optionA, '__bye__');
      } else {
        t = pick(t, matchup.optionA, matchup.optionB);
        picks++;
      }
    }
    expect(picks).toBe(2);
  });

  it('N=4 full run — ranked list has all 4 options', () => {
    const opts = ['A', 'B', 'C', 'D'];
    let t = createTournament(opts, 7);

    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      t = pick(t, m.optionA, m.isBye ? '__bye__' : m.optionB);
    }

    const ranked = buildRankedList(t);
    expect(ranked).toHaveLength(4);
    expect(new Set(ranked).size).toBe(4); // all unique
    opts.forEach(o => expect(ranked).toContain(o));

    // numRounds=2: aThreshold=ceil(2/4)=1, bThreshold=ceil(2/2)=1
    // S=1 (champion), A=1 (final loser fromEnd=0), B=0 (aThreshold==bThreshold), C=2 (round-0 losers)
    const tiers = Object.fromEntries(
      (['S', 'A', 'B', 'C'] as const).map(tier => [tier, t.eliminated.filter(e => e.tier === tier).length]),
    );
    expect(tiers.S).toBe(1);
    expect(tiers.A).toBe(1);
    expect(tiers.B).toBe(0);
    expect(tiers.C).toBe(2);
    // Champion must be S tier
    expect(t.eliminated.find(e => e.option === t.champion)?.tier).toBe('S');
  });

  it('champion is always first in ranked list', () => {
    const opts = ['X', 'Y', 'Z', 'W'];
    let t = createTournament(opts, 3);
    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      t = pick(t, m.optionA, m.isBye ? '__bye__' : m.optionB);
    }
    const ranked = buildRankedList(t);
    expect(ranked[0]).toBe(t.champion);
  });

  it('N=8 full run — 3 rounds, ranked list complete, no byes in output', () => {
    const opts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    let t = createTournament(opts, 42);

    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      t = pick(t, m.optionA, m.isBye ? '__bye__' : m.optionB);
    }

    const ranked = buildRankedList(t);
    expect(ranked).toHaveLength(8);
    expect(new Set(ranked).size).toBe(8);
    opts.forEach(o => expect(ranked).toContain(o));
    expect(ranked).not.toContain('__bye__');
    expect(ranked[0]).toBe(t.champion);

    // numRounds=3: aThreshold=ceil(3/4)=1, bThreshold=ceil(3/2)=2
    // S=1, A=1 (final loser), B=2 (semifinal losers), C=4 (quarterfinal losers)
    const tiers = Object.fromEntries(
      (['S', 'A', 'B', 'C'] as const).map(tier => [tier, t.eliminated.filter(e => e.tier === tier).length]),
    );
    expect(tiers.S).toBe(1);
    expect(tiers.A).toBe(1);
    expect(tiers.B).toBe(2);
    expect(tiers.C).toBe(4);
    expect(tiers.S + tiers.A + tiers.B + tiers.C).toBe(8);
  });

  it('N=6 full run — 3 rounds with byes, bracket advances correctly', () => {
    const opts = ['A', 'B', 'C', 'D', 'E', 'F'];
    let t = createTournament(opts, 7);
    let realPicks = 0;

    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      if (m.isBye) {
        t = pick(t, m.optionA, '__bye__');
      } else {
        t = pick(t, m.optionA, m.optionB);
        realPicks++;
      }
    }

    const ranked = buildRankedList(t);
    expect(ranked).toHaveLength(6);
    expect(ranked).not.toContain('__bye__');
    expect(ranked[0]).toBe(t.champion);
    expect(realPicks).toBe(5);

    // N=6: numRounds=3 (same as N=8, next power-of-2 is 8)
    // aThreshold=1, bThreshold=2 — same formula as N=8
    // S=1, A=1 (final loser), B=1 (one semifinal loser; the other slot was a bye), C=3 (round-0 real losers)
    const tiers = Object.fromEntries(
      (['S', 'A', 'B', 'C'] as const).map(tier => [tier, t.eliminated.filter(e => e.tier === tier).length]),
    );
    expect(tiers.S).toBe(1);
    expect(tiers.A).toBe(1);
    expect(tiers.B).toBe(1);
    expect(tiers.C).toBe(3);
    expect(tiers.S + tiers.A + tiers.B + tiers.C).toBe(6);
  });

  it('N=12 tier distribution — backward-compatible with original thresholds', () => {
    const opts = Array.from({ length: 12 }, (_, i) => `opt${i}`);
    let t = createTournament(opts, 1);

    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      t = pick(t, m.optionA, m.isBye ? '__bye__' : m.optionB);
    }

    const tiers = Object.fromEntries(
      (['S', 'A', 'B', 'C'] as const).map(tier => [
        tier,
        t.eliminated.filter(e => e.tier === tier).length,
      ]),
    );
    expect(tiers.S).toBe(1);
    expect(tiers.A).toBe(1);  // final loser only (fromEnd=0 < ceil(4/4)=1)
    expect(tiers.B).toBe(1);  // semifinal loser (fromEnd=1 < ceil(4/2)=2)
    expect(tiers.C).toBe(9);  // everything earlier
    expect(tiers.S + tiers.A + tiers.B + tiers.C).toBe(12);
  });

  it('N=32 tier distribution — proportional thresholds reduce C-tier crowding', () => {
    const opts = Array.from({ length: 32 }, (_, i) => `opt${i}`);
    let t = createTournament(opts, 1);

    while (!t.champion) {
      const m = t.rounds[t.currentRound][t.currentMatchup];
      t = pick(t, m.optionA, m.isBye ? '__bye__' : m.optionB);
    }

    const tiers = Object.fromEntries(
      (['S', 'A', 'B', 'C'] as const).map(tier => [
        tier,
        t.eliminated.filter(e => e.tier === tier).length,
      ]),
    );
    // numRounds=5: A threshold=ceil(5/4)=2, B threshold=ceil(5/2)=3
    // fromEnd=0 (final loser) → A; fromEnd=1 (semifinal losers, 2) → A
    // fromEnd=2 (quarterfinal losers, 4) → B
    // fromEnd=3,4 (16+8=24) → C
    expect(tiers.S).toBe(1);
    expect(tiers.A).toBe(3);  // final + 2 semifinal losers
    expect(tiers.B).toBe(4);  // 4 quarterfinal losers
    expect(tiers.C).toBe(24); // 75% in C (vs 87.5% without fix)
    expect(tiers.S + tiers.A + tiers.B + tiers.C).toBe(32);
  });
});

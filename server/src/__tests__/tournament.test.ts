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
});

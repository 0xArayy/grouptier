import { describe, it, expect } from 'vitest';
import { computeBorda } from '../db/borda.js';

describe('computeBorda', () => {
  it('single voter — ranks options by score', () => {
    const result = computeBorda([['A', 'B', 'C']]);
    expect(result[0].option).toBe('A');
    expect(result[0].score).toBe(2);
    expect(result[1].option).toBe('B');
    expect(result[1].score).toBe(1);
    expect(result[2].option).toBe('C');
    expect(result[2].score).toBe(0);
  });

  it('two voters, agreement — scores double', () => {
    const result = computeBorda([['A', 'B'], ['A', 'B']]);
    expect(result[0].option).toBe('A');
    expect(result[0].score).toBe(2); // 1+1
    expect(result[1].option).toBe('B');
    expect(result[1].score).toBe(0); // 0+0
  });

  it('two voters, disagreement — tie', () => {
    const result = computeBorda([['A', 'B'], ['B', 'A']]);
    expect(result[0].score).toBe(result[1].score);
  });

  it('N=2 works correctly', () => {
    const result = computeBorda([['X', 'Y']]);
    expect(result[0].option).toBe('X');
    expect(result[0].score).toBe(1);
    expect(result[1].option).toBe('Y');
    expect(result[1].score).toBe(0);
  });

  it('empty input returns empty array', () => {
    expect(computeBorda([])).toEqual([]);
  });

  it('accumulates scores across multiple users (N=5)', () => {
    // user 1: A>B>C>D>E
    // user 2: E>D>C>B>A
    const result = computeBorda([
      ['A', 'B', 'C', 'D', 'E'],
      ['E', 'D', 'C', 'B', 'A'],
    ]);
    // C is 3rd for both → always 2 pts each → total 4
    const c = result.find(r => r.option === 'C');
    expect(c?.score).toBe(4);
    // A and E are symmetric — both score 4+0 = 4
    const a = result.find(r => r.option === 'A');
    const e = result.find(r => r.option === 'E');
    expect(a?.score).toBe(e?.score);
  });
});

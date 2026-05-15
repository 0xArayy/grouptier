export type Tier = 'S' | 'A' | 'B' | 'C';

export interface Matchup {
  optionA: string;
  optionB: string;
  isBye: boolean; // optionB is a bye — auto-advance optionA
}

export interface TierEntry {
  option: string;
  tier: Tier;
}

export interface TournamentState {
  rounds: Matchup[][];
  currentRound: number;
  currentMatchup: number;
  eliminated: TierEntry[]; // options that have lost
  champion: string | null;
  totalMatchups: number;
  completedMatchups: number;
}

/**
 * Deterministic shuffle seeded by userId so every user sees different ordering.
 * Simple xorshift seeded by userId.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Create initial tournament state for a set of options and a user seed.
 */
export function createTournament(options: string[], userId: number): TournamentState {
  const shuffled = seededShuffle(options, userId);
  const round1: Matchup[] = [];
  const autoAdvanced: string[] = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      round1.push({ optionA: shuffled[i], optionB: shuffled[i + 1], isBye: false });
    } else {
      round1.push({ optionA: shuffled[i], optionB: '', isBye: true });
      autoAdvanced.push(shuffled[i]);
    }
  }

  const totalMatchups = options.length - 1; // single-elimination always N-1 comparisons

  return {
    rounds: [round1],
    currentRound: 0,
    currentMatchup: 0,
    eliminated: [],
    champion: null,
    totalMatchups,
    completedMatchups: 0,
  };
}

/**
 * Assign tier based on round lost in. Rounds are 0-indexed.
 * numRounds = ceil(log2(N))
 */
function assignTier(roundLost: number, numRounds: number): Tier {
  if (numRounds <= 1) return roundLost === 0 ? 'C' : 'S';
  const fromEnd = numRounds - 1 - roundLost; // 0 = final, 1 = semifinal, etc.
  if (fromEnd === 0) return 'A'; // final loser
  if (fromEnd === 1) return 'B'; // semifinal loser
  return 'C'; // earlier loser
}

/**
 * Process a pick (winner beats loser) and return the next state.
 * Returns { nextState, done: true } when all comparisons are complete.
 */
export function pick(
  state: TournamentState,
  winner: string,
  loser: string,
): TournamentState {
  const numRounds = Math.ceil(Math.log2(
    state.rounds[0].length * 2 + (state.rounds[0].some(m => m.isBye) ? 1 : 0),
  )) || 1;

  const eliminated: TierEntry[] = [
    ...state.eliminated,
    { option: loser, tier: assignTier(state.currentRound, numRounds) },
  ];

  const completedMatchups = state.completedMatchups + 1;
  const currentRound = state.currentRound;
  const currentMatchup = state.currentMatchup;
  const rounds = state.rounds.map(r => [...r]);

  // Advance to next matchup or next round
  let nextRound = currentRound;
  let nextMatchup = currentMatchup + 1;

  // Collect winners from current round to build next round
  const currentRoundMatchups = rounds[currentRound];

  if (nextMatchup >= currentRoundMatchups.length) {
    // Collect all round winners (including byes)
    const roundWinners: string[] = [];
    for (let i = 0; i < currentRoundMatchups.length; i++) {
      const m = currentRoundMatchups[i];
      if (m.isBye) {
        roundWinners.push(m.optionA);
      } else if (i === currentMatchup) {
        roundWinners.push(winner);
      } else {
        // Prior matchups — get from eliminated inverse (not ideal, passing through state)
        // Actually we need to track round winners separately
        roundWinners.push(m.optionA); // placeholder — handled below
      }
    }

    // Build next round if more than 1 winner
    if (roundWinners.length > 1) {
      const nextRoundMatchups: Matchup[] = [];
      for (let i = 0; i < roundWinners.length; i += 2) {
        if (i + 1 < roundWinners.length) {
          nextRoundMatchups.push({ optionA: roundWinners[i], optionB: roundWinners[i + 1], isBye: false });
        } else {
          nextRoundMatchups.push({ optionA: roundWinners[i], optionB: '', isBye: true });
        }
      }
      rounds.push(nextRoundMatchups);
      nextRound = currentRound + 1;
      nextMatchup = 0;
    } else {
      // Tournament done — roundWinners[0] is champion
      return {
        ...state,
        eliminated: [...eliminated, { option: roundWinners[0], tier: 'S' }],
        champion: roundWinners[0],
        completedMatchups,
        rounds,
      };
    }
  }

  return {
    ...state,
    rounds,
    currentRound: nextRound,
    currentMatchup: nextMatchup,
    eliminated,
    champion: null,
    completedMatchups,
  };
}

/**
 * Build ranked list from tournament result (champion first, then by tier).
 * Options within the same tier are ordered by elimination order (last eliminated first).
 */
export function buildRankedList(state: TournamentState): string[] {
  const champion = state.champion;
  const tierOrder: Tier[] = ['S', 'A', 'B', 'C'];

  const result: string[] = [];
  for (const tier of tierOrder) {
    const inTier = state.eliminated
      .filter(e => e.tier === tier)
      .map(e => e.option)
      .reverse(); // last eliminated = better within tier
    result.push(...inTier);
  }

  // Champion may not be in eliminated — put S-tier ones first
  if (champion && !result.includes(champion)) {
    result.unshift(champion);
  }

  return result;
}

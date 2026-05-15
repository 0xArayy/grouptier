export interface BordaResult {
  option: string;
  score: number;
}

/**
 * Borda count aggregation. Each user's ranked_list is ordered best→worst.
 * Options in the same tier get averaged rank positions (tied Borda).
 * Returns options sorted by score descending.
 */
export function computeBorda(rankedLists: string[][]): BordaResult[] {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    const n = list.length;
    // Each option gets n - rank points (rank is 1-based)
    list.forEach((option, idx) => {
      const points = n - (idx + 1);
      scores.set(option, (scores.get(option) ?? 0) + points);
    });
  }

  return [...scores.entries()]
    .map(([option, score]) => ({ option, score }))
    .sort((a, b) => b.score - a.score || a.option.localeCompare(b.option));
}

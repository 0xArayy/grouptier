import { useState } from 'react';
import type { Matchup } from '../lib/tournament.ts';

interface Props {
  matchup: Matchup;
  currentRound: number;
  totalRounds: number;
  completedMatchups: number;
  totalMatchups: number;
  onPick: (winner: string, loser: string) => Promise<void>;
}

export function Compare({ matchup, currentRound, totalRounds, completedMatchups, totalMatchups, onPick }: Props) {
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(winner: string, loser: string) {
    if (picking) return;
    setPicking(winner);
    setError(null);
    try {
      await onPick(winner, loser);
    } catch {
      setError('Failed to save — tap to retry');
      setPicking(null);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.roundLabel}>Round {currentRound + 1} of {totalRounds}</span>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${(completedMatchups / totalMatchups) * 100}%`,
            }}
          />
        </div>
        <span style={styles.progressText}>{completedMatchups}/{totalMatchups}</span>
      </div>

      <div style={styles.prompt}>Which do you prefer?</div>

      <div style={styles.cards}>
        <button
          style={{
            ...styles.card,
            opacity: picking && picking !== matchup.optionA ? 0.5 : 1,
            transform: picking === matchup.optionA ? 'scale(0.96)' : 'scale(1)',
          }}
          onClick={() => handlePick(matchup.optionA, matchup.optionB)}
          disabled={!!picking}
        >
          {matchup.optionA}
        </button>

        <div style={styles.vs}>VS</div>

        <button
          style={{
            ...styles.card,
            opacity: picking && picking !== matchup.optionB ? 0.5 : 1,
            transform: picking === matchup.optionB ? 'scale(0.96)' : 'scale(1)',
          }}
          onClick={() => handlePick(matchup.optionB, matchup.optionA)}
          disabled={!!picking}
        >
          {matchup.optionB}
        </button>
      </div>

      {error && (
        <div style={styles.errorToast} onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    gap: 24,
    flex: 1,
  },
  header: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'center',
  },
  roundLabel: {
    fontSize: 13,
    color: 'var(--text-hint)',
    fontWeight: 500,
  },
  progressBar: {
    width: '100%',
    height: 4,
    background: 'var(--surface)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: 12,
    color: 'var(--text-hint)',
  },
  prompt: {
    fontSize: 20,
    fontWeight: 600,
    textAlign: 'center',
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    minHeight: 'var(--tap-target-min)',
    padding: '20px 24px',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderRadius: 'var(--radius)',
    fontSize: 18,
    fontWeight: 600,
    textAlign: 'center',
    transition: 'transform 0.1s ease, opacity 0.2s ease',
    cursor: 'pointer',
    lineHeight: 1.3,
  },
  vs: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-hint)',
    letterSpacing: 2,
  },
  errorToast: {
    background: '#c62828',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'center',
  },
};

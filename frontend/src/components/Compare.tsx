import { useState } from 'react';
import type { Matchup } from '../lib/tournament.ts';
import styles from './Compare.module.css';

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
      setError('Не удалось сохранить — нажми ещё раз');
      setPicking(null);
    }
  }

  const progress = totalMatchups > 0 ? (completedMatchups / totalMatchups) * 100 : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.roundRow}>
          <span className={styles.roundLabel}>РАУНД {currentRound + 1}/{totalRounds}</span>
          <span className={styles.progressText}>{completedMatchups} / {totalMatchups}</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className={styles.question}>
        <div className={styles.questionMono}>ЧТО ПРЕДПОЧИТАЕШЬ?</div>
        <div className={styles.questionMain}>Выбери одно</div>
      </div>

      <div className={styles.cards}>
        <button
          className={styles.card}
          style={{
            opacity: picking && picking !== matchup.optionA ? 0.4 : 1,
            transform: picking === matchup.optionA ? 'scale(0.96)' : 'scale(1)',
          }}
          onClick={() => handlePick(matchup.optionA, matchup.optionB)}
          disabled={!!picking}
        >
          {matchup.optionA}
        </button>

        <div className={styles.orBadge}>ИЛИ</div>

        <button
          className={styles.card}
          style={{
            opacity: picking && picking !== matchup.optionB ? 0.4 : 1,
            transform: picking === matchup.optionB ? 'scale(0.96)' : 'scale(1)',
          }}
          onClick={() => handlePick(matchup.optionB, matchup.optionA)}
          disabled={!!picking}
        >
          {matchup.optionB}
        </button>
      </div>

      {error && (
        <div className={styles.errorToast} onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}

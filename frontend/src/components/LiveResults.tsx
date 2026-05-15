interface BordaEntry {
  option: string;
  score: number;
}

interface Props {
  sessionName: string;
  bordaRanking: BordaEntry[];
  resultCount: number;
  voterCount: number;
  sessionClosed: boolean;
  onShare?: () => void;
}

export function LiveResults({
  sessionName,
  bordaRanking,
  resultCount,
  voterCount,
  sessionClosed,
  onShare,
}: Props) {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>{sessionName}</h2>
      <div style={styles.subtitle}>
        Group ranking · {resultCount} of {voterCount} voted
      </div>

      {sessionClosed && (
        <div style={styles.closedBanner}>🔒 Voting closed</div>
      )}

      {bordaRanking.length === 0 ? (
        <div style={styles.empty}>No votes yet. Be the first!</div>
      ) : (
        <div style={styles.list}>
          {bordaRanking.map((entry, i) => (
            <div key={entry.option} style={styles.entry}>
              <span style={styles.rank}>{i + 1}</span>
              <span style={styles.option}>{entry.option}</span>
              <span style={styles.score}>{entry.score} pts</span>
            </div>
          ))}
        </div>
      )}

      {onShare && (
        <button style={styles.shareBtn} onClick={onShare}>
          Share my picks
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 16,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-hint)',
    textAlign: 'center',
  },
  closedBanner: {
    background: '#37474f',
    color: '#cfd8dc',
    padding: '10px 16px',
    borderRadius: 'var(--radius)',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  },
  empty: {
    textAlign: 'center',
    color: 'var(--text-hint)',
    marginTop: 32,
    fontSize: 15,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
  },
  rank: {
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--accent)',
    width: 28,
    textAlign: 'center',
  },
  option: {
    flex: 1,
    fontSize: 16,
    fontWeight: 500,
  },
  score: {
    fontSize: 14,
    color: 'var(--text-hint)',
    fontWeight: 500,
  },
  shareBtn: {
    marginTop: 8,
    padding: '14px',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderRadius: 'var(--radius)',
    fontSize: 15,
    fontWeight: 600,
    width: '100%',
    minHeight: 'var(--tap-target-min)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
};

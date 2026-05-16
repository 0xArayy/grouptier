interface TierRow {
  tier: 'S' | 'A' | 'B' | 'C';
  options: string[];
}

interface Props {
  rankedList: string[];
  sessionClosed?: boolean;
  onSubmit?: () => void;
  submitting?: boolean;
  submitError?: string;
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  S: { bg: 'var(--tier-s)', text: 'var(--tier-s-text)' },
  A: { bg: 'var(--tier-a)', text: 'var(--tier-a-text)' },
  B: { bg: 'var(--tier-b)', text: 'var(--tier-b-text)' },
  C: { bg: 'var(--tier-c)', text: 'var(--tier-c-text)' },
};

export function TierList({ rankedList, sessionClosed, onSubmit, submitting, submitError }: Props) {
  const n = rankedList.length;
  const tierSize = Math.ceil(n / 4);

  const rows: TierRow[] = (
    [
      { tier: 'S', options: rankedList.slice(0, tierSize) },
      { tier: 'A', options: rankedList.slice(tierSize, tierSize * 2) },
      { tier: 'B', options: rankedList.slice(tierSize * 2, tierSize * 3) },
      { tier: 'C', options: rankedList.slice(tierSize * 3) },
    ] as TierRow[]
  ).filter(r => r.options.length > 0);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Your Tier List</h2>

      {sessionClosed && (
        <div style={styles.closedBanner}>🔒 Voting closed</div>
      )}

      <div style={styles.grid}>
        {rows.map(({ tier, options }) => (
          <div key={tier} style={styles.row}>
            <div
              style={{
                ...styles.tierLabel,
                background: TIER_COLORS[tier].bg,
                color: TIER_COLORS[tier].text,
              }}
            >
              {tier}
            </div>
            <div style={styles.chips}>
              {options.map(opt => (
                <span key={opt} style={styles.chip}>
                  {opt}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {submitError && (
        <div style={{ color: '#e53e3e', fontSize: 13, textAlign: 'center', padding: '4px 0' }}>
          {submitError}
        </div>
      )}
      {onSubmit && !sessionClosed && (
        <button
          style={{
            ...styles.submitBtn,
            opacity: submitting ? 0.7 : 1,
          }}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Submit my picks'}
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
  closedBanner: {
    background: '#37474f',
    color: '#cfd8dc',
    padding: '10px 16px',
    borderRadius: 'var(--radius)',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  tierLabel: {
    width: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 800,
    flexShrink: 0,
  },
  chips: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '10px 12px',
    background: 'var(--surface)',
    alignItems: 'center',
  },
  chip: {
    background: 'var(--bg)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 14,
    fontWeight: 500,
  },
  submitBtn: {
    marginTop: 8,
    padding: '16px',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    borderRadius: 'var(--radius)',
    fontSize: 16,
    fontWeight: 700,
    width: '100%',
    minHeight: 'var(--tap-target-min)',
    transition: 'opacity 0.2s',
  },
};

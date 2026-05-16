interface TierRow {
  tier: 'S' | 'A' | 'B' | 'C';
  options: string[];
}

interface Props {
  rankedList: string[];
  sessionClosed?: boolean;
  onSubmit?: () => void;
  onViewGroup?: () => void;
  submitting?: boolean;
  submitError?: string;
}

const TIER_META: Record<string, { bg: string; text: string; shadow: string }> = {
  S: { bg: 'var(--tier-s)', text: 'var(--tier-s-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
  A: { bg: 'var(--tier-a)', text: 'var(--tier-a-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
  B: { bg: 'var(--tier-b)', text: 'var(--tier-b-text)', shadow: '0 2px 0 rgba(255,255,255,0.4)' },
  C: { bg: 'var(--tier-c)', text: 'var(--tier-c-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
};

export function TierList({ rankedList, sessionClosed, onSubmit, onViewGroup, submitting, submitError }: Props) {
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

  const champion = rankedList[0];
  const nonSRows = rows.filter(r => r.tier !== 'S');

  return (
    <div style={styles.container}>
      {/* Hero champion banner */}
      {champion && (
        <div style={styles.heroBanner}>
          <div style={styles.heroInner}>
            <div style={styles.heroEmoji}>🏆</div>
            <div style={styles.heroInfo}>
              <div style={styles.heroEyebrow}>YOUR S TIER · CHAMPION</div>
              <div style={styles.heroName}>{champion.toUpperCase()}</div>
              <div style={styles.heroSub}>Beat everyone in your bracket</div>
            </div>
          </div>
        </div>
      )}

      {sessionClosed && (
        <div style={styles.closedBanner}>🔒 Voting closed</div>
      )}

      {/* A/B/C tier rows */}
      <div style={styles.grid}>
        {nonSRows.map(({ tier, options }) => {
          const meta = TIER_META[tier];
          return (
            <div key={tier} style={styles.row}>
              <div style={{
                ...styles.tierLabel,
                background: meta.bg,
                color: meta.text,
                textShadow: meta.shadow,
              }}>
                {tier}
              </div>
              <div style={styles.chips}>
                {options.map(opt => (
                  <span key={opt} style={styles.chip}>{opt}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {submitError && (
        <div style={{ color: 'var(--tier-s)', fontSize: 13, textAlign: 'center', padding: '4px 0' }}>
          {submitError}
        </div>
      )}

      {/* Footer buttons */}
      <div style={styles.footer}>
        {onSubmit && !sessionClosed && (
          <button
            style={{ ...styles.submitBtn, opacity: submitting ? 0.7 : 1 }}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Submit my picks'}
          </button>
        )}
        {onViewGroup && (
          <button style={styles.groupBtn} onClick={onViewGroup}>
            See group →
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '0 0 16px',
    flex: 1,
  },
  heroBanner: {
    margin: '12px 14px 4px',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #FF4D4D 0%, #FF7A52 100%)',
    color: '#fff',
    boxShadow: '0 8px 24px var(--accent-shadow)',
  },
  heroInner: {
    padding: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  heroEmoji: {
    fontSize: 44,
    lineHeight: 1,
    flexShrink: 0,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.5,
    opacity: 0.85,
  },
  heroName: {
    fontSize: 20,
    fontWeight: 900,
    lineHeight: 1,
    marginTop: 3,
    fontFamily: 'var(--font-display)',
    letterSpacing: -0.3,
    textShadow: '0 1px 0 rgba(0,0,0,0.18)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  heroSub: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.9,
  },
  closedBanner: {
    background: 'var(--surface)',
    color: 'var(--text-hint)',
    padding: '10px 16px',
    margin: '0 14px',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '4px 14px',
  },
  row: {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    background: 'var(--surface)',
    boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
  },
  tierLabel: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 27,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: -1,
    flexShrink: 0,
  },
  chips: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 10px',
    alignItems: 'center',
  },
  chip: {
    background: 'var(--bg)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
  },
  footer: {
    padding: '4px 14px 0',
    display: 'flex',
    gap: 8,
  },
  submitBtn: {
    flex: 1,
    padding: '14px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
    fontSize: 15,
    fontWeight: 800,
    minHeight: 'var(--tap-target-min)',
    transition: 'opacity 0.2s',
    cursor: 'pointer',
    boxShadow: '0 2px 8px var(--accent-shadow)',
  },
  groupBtn: {
    flex: 1,
    padding: '14px',
    background: 'var(--surface)',
    color: 'var(--accent)',
    borderRadius: 'var(--radius-md)',
    fontSize: 15,
    fontWeight: 700,
    minHeight: 'var(--tap-target-min)',
    cursor: 'pointer',
  },
};

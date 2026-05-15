import { useEffect } from 'react';

interface Props {
  option: string;
  onDone: () => void;
}

export function ByeScreen({ option, onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={styles.container}>
      <div style={styles.badge}>AUTO ✓</div>
      <div style={styles.option}>{option}</div>
      <div style={styles.label}>passes automatically</div>
      <div style={styles.bar}>
        <div style={styles.fill} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 16,
    padding: 24,
  },
  badge: {
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
  },
  option: {
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
  },
  label: {
    fontSize: 15,
    color: 'var(--text-hint)',
  },
  bar: {
    width: 120,
    height: 3,
    background: 'var(--surface)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    animation: 'fillBar 1.2s linear forwards',
    width: '0%',
  },
};

import { useEffect, useRef, useState } from 'react';

type Tier = 'S' | 'A' | 'B' | 'C';

interface TierRow {
  tier: Tier;
  options: string[];
}

interface Props {
  rankedList: string[];
  sessionClosed?: boolean;
  onSubmit?: (reorderedList: string[]) => void;
  onViewGroup?: () => void;
  submitting?: boolean;
  submitError?: string;
}

const TIER_META: Record<Tier, { bg: string; text: string; shadow: string }> = {
  S: { bg: 'var(--tier-s)', text: 'var(--tier-s-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
  A: { bg: 'var(--tier-a)', text: 'var(--tier-a-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
  B: { bg: 'var(--tier-b)', text: 'var(--tier-b-text)', shadow: '0 2px 0 rgba(255,255,255,0.4)' },
  C: { bg: 'var(--tier-c)', text: 'var(--tier-c-text)', shadow: '0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10)' },
};

function buildRows(rankedList: string[]): TierRow[] {
  const n = rankedList.length;
  const tierSize = Math.ceil(n / 4);
  return ([
    { tier: 'S' as Tier, options: rankedList.slice(0, tierSize) },
    { tier: 'A' as Tier, options: rankedList.slice(tierSize, tierSize * 2) },
    { tier: 'B' as Tier, options: rankedList.slice(tierSize * 2, tierSize * 3) },
    { tier: 'C' as Tier, options: rankedList.slice(tierSize * 3) },
  ] as TierRow[]).filter(r => r.options.length > 0);
}

export function TierList({ rankedList, sessionClosed, onSubmit, onViewGroup, submitting, submitError }: Props) {
  const [rows, setRows] = useState<TierRow[]>(() => buildRows(rankedList));

  // Drag state — overTierRef is the ref-of-truth for document event handlers;
  // overTier state drives the highlight re-render.
  const [activeOption, setActiveOption] = useState<string | null>(null);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [overTier, setOverTier] = useState<Tier | null>(null);
  const overTierRef = useRef<Tier | null>(null);
  const dragRef = useRef<{ option: string; fromTier: Tier } | null>(null);
  const rowRefs = useRef<Map<Tier, HTMLDivElement>>(new Map());
  // Cleanup ref so useEffect can remove listeners on unmount
  const cleanupRef = useRef<(() => void) | null>(null);

  const champion = rows.find(r => r.tier === 'S')?.options[0] ?? rankedList[0];
  const nonSRows = rows.filter(r => r.tier !== 'S');
  // Drag only makes sense when there are multiple target tiers to move between.
  const canDrag = !sessionClosed && !submitting && nonSRows.length > 1;

  // Remove document listeners on unmount (in case drag is in progress)
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  function setHoverTier(tier: Tier | null) {
    overTierRef.current = tier;
    setOverTier(tier);
  }

  function clearDragState() {
    dragRef.current = null;
    setActiveOption(null);
    setFloatPos(null);
    setHoverTier(null);
  }

  function hitTestTier(x: number, y: number): Tier | null {
    for (const [tier, el] of rowRefs.current) {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
        return tier;
      }
    }
    return null;
  }

  function onChipPointerDown(e: React.PointerEvent<HTMLSpanElement>, option: string, fromTier: Tier) {
    if (!canDrag) return;
    // Don't call preventDefault — let touch-action:none on the chip handle scroll prevention.
    // Don't use setPointerCapture — attach to document instead for cross-WebView reliability.

    dragRef.current = { option, fromTier };
    setActiveOption(option);
    setFloatPos({ x: e.clientX, y: e.clientY });
    setHoverTier(fromTier);

    function onDocMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      setFloatPos({ x: ev.clientX, y: ev.clientY });
      setHoverTier(hitTestTier(ev.clientX, ev.clientY));
    }

    function commit() {
      const drag = dragRef.current;
      if (drag) {
        const target = overTierRef.current;
        if (target && target !== drag.fromTier) {
          setRows(prev => {
            const next = prev.map(r => ({ ...r, options: [...r.options] }));
            const src = next.find(r => r.tier === drag.fromTier);
            if (src) src.options = src.options.filter(o => o !== drag.option);
            const dst = next.find(r => r.tier === target);
            if (dst) dst.options.push(drag.option);
            return next.filter(r => r.options.length > 0);
          });
        }
      }
      clearDragState();
      cleanup();
    }

    function cancel() {
      // OS interrupt — roll back without committing
      clearDragState();
      cleanup();
    }

    function cleanup() {
      document.removeEventListener('pointermove', onDocMove);
      document.removeEventListener('pointerup', commit);
      document.removeEventListener('pointercancel', cancel);
      cleanupRef.current = null;
    }

    document.addEventListener('pointermove', onDocMove, { passive: true });
    document.addEventListener('pointerup', commit);
    document.addEventListener('pointercancel', cancel);
    cleanupRef.current = cleanup;
  }

  function handleSubmit() {
    if (!onSubmit) return;
    onSubmit(rows.flatMap(r => r.options));
  }

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

      {/* A/B/C tier rows — draggable chips */}
      <div style={styles.grid}>
        {nonSRows.map(({ tier, options }) => {
          const meta = TIER_META[tier];
          const isOver = overTier === tier && activeOption !== null;
          return (
            <div
              key={tier}
              ref={el => {
                if (el) rowRefs.current.set(tier, el);
                else rowRefs.current.delete(tier);
              }}
              style={{
                ...styles.row,
                outline: isOver ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'var(--surface)',
              }}
            >
              <div
                style={{
                  ...styles.tierLabel,
                  background: meta.bg,
                  color: meta.text,
                  textShadow: meta.shadow,
                }}
              >
                {tier}
              </div>
              <div style={styles.chips}>
                {options.map(opt => {
                  const isDragging = activeOption === opt;
                  return (
                    <span
                      key={opt}
                      style={{
                        ...styles.chip,
                        opacity: isDragging ? 0.25 : 1,
                        cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        touchAction: 'none',
                        userSelect: 'none',
                        transition: isDragging ? 'none' : 'opacity 0.15s',
                      }}
                      onPointerDown={e => onChipPointerDown(e, opt, tier)}
                    >
                      {opt}
                    </span>
                  );
                })}
                {/* Empty-tier drop hint */}
                {options.length === 0 && (
                  <span style={styles.emptyHint}>drop here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canDrag && nonSRows.length > 1 && (
        <div style={styles.dragHint}>Hold &amp; drag chips to rearrange tiers</div>
      )}

      {/* Floating chip clone during drag */}
      {floatPos && activeOption && (
        <div
          style={{
            position: 'fixed',
            left: floatPos.x - 40,
            top: floatPos.y - 16,
            zIndex: 1000,
            pointerEvents: 'none',
            background: 'var(--bg)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            transform: 'scale(1.1) rotate(-2deg)',
          }}
        >
          {activeOption}
        </div>
      )}

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
            onClick={handleSubmit}
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
    boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
    transition: 'outline-color 0.1s, background 0.1s',
  },
  tierLabel: {
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 35,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: -1.5,
    flexShrink: 0,
  },
  chips: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 10px',
    alignItems: 'center',
    minHeight: 56,
  },
  chip: {
    background: 'var(--bg)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
  },
  emptyHint: {
    fontSize: 11,
    color: 'var(--text-hint)',
    fontStyle: 'italic',
    opacity: 0.6,
  },
  dragHint: {
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--text-hint)',
    opacity: 0.6,
    padding: '0 14px',
    marginTop: -4,
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

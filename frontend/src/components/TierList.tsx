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
  return [
    { tier: 'S' as Tier, options: rankedList.slice(0, tierSize) },
    { tier: 'A' as Tier, options: rankedList.slice(tierSize, tierSize * 2) },
    { tier: 'B' as Tier, options: rankedList.slice(tierSize * 2, tierSize * 3) },
    { tier: 'C' as Tier, options: rankedList.slice(tierSize * 3) },
  ] as TierRow[];
}

export function TierList({ rankedList, sessionClosed, onSubmit, onViewGroup, submitting, submitError }: Props) {
  const [rows, setRows] = useState<TierRow[]>(() => buildRows(rankedList));

  const [activeOption, setActiveOption] = useState<string | null>(null);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [overTier, setOverTier] = useState<Tier | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const overTierRef = useRef<Tier | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const dragRef = useRef<{ option: string; fromTier: Tier; fromIndex: number } | null>(null);
  const rowRefs = useRef<Map<Tier, HTMLDivElement>>(new Map());
  // chipKey = `${tier}-${option}`
  const chipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const cleanupRef = useRef<(() => void) | null>(null);

  const canDrag = !sessionClosed && !submitting && rows.length > 1;

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  function setHoverPos(tier: Tier | null, index: number | null) {
    overTierRef.current = tier;
    overIndexRef.current = index;
    setOverTier(tier);
    setOverIndex(index);
  }

  function clearDragState() {
    dragRef.current = null;
    setActiveOption(null);
    setFloatPos(null);
    setHoverPos(null, null);
  }

  // Returns tier + insertion index within that tier's options array.
  function hitTestPosition(x: number, y: number): { tier: Tier; index: number } | null {
    for (const [tier, el] of rowRefs.current) {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
        const tierOptions = rows.find(r => r.tier === tier)?.options ?? [];
        let insertIndex = tierOptions.length;
        for (let i = 0; i < tierOptions.length; i++) {
          const chipEl = chipRefs.current.get(`${tier}-${tierOptions[i]}`);
          if (!chipEl) continue;
          const cr = chipEl.getBoundingClientRect();
          if (x < cr.left + cr.width / 2) {
            insertIndex = i;
            break;
          }
        }
        return { tier, index: insertIndex };
      }
    }
    return null;
  }

  function onChipPointerDown(e: React.PointerEvent<HTMLSpanElement>, option: string, fromTier: Tier) {
    if (!canDrag) return;
    e.preventDefault();
    window.Telegram?.WebApp?.disableVerticalSwipes?.();
    document.body.style.userSelect = 'none';

    const fromIndex = rows.find(r => r.tier === fromTier)?.options.indexOf(option) ?? 0;
    dragRef.current = { option, fromTier, fromIndex };
    setActiveOption(option);
    setFloatPos({ x: e.clientX, y: e.clientY });
    setHoverPos(fromTier, fromIndex);

    function onDocMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      setFloatPos({ x: ev.clientX, y: ev.clientY });
      const pos = hitTestPosition(ev.clientX, ev.clientY);
      setHoverPos(pos?.tier ?? null, pos?.index ?? null);
    }

    function commit() {
      window.Telegram?.WebApp?.enableVerticalSwipes?.();
      const drag = dragRef.current;
      if (drag) {
        const target = overTierRef.current;
        const dropIndex = overIndexRef.current;
        if (target !== null) {
          setRows(prev => {
            const next = prev.map(r => ({ ...r, options: [...r.options] }));
            const src = next.find(r => r.tier === drag.fromTier);
            const dst = next.find(r => r.tier === target);
            if (!src || !dst) return prev;

            // Remove from source (when same tier, src === dst, so this mutates dst too)
            src.options = src.options.filter(o => o !== drag.option);

            // Calculate insertion point in the now-filtered dst array
            let insertAt: number;
            if (drag.fromTier === target) {
              // Same tier: overIndex was relative to the original array (including ghost),
              // adjust by -1 if the ghost was before the drop point.
              const raw = dropIndex ?? dst.options.length;
              insertAt = raw > drag.fromIndex ? raw - 1 : raw;
            } else {
              insertAt = dropIndex ?? dst.options.length;
            }
            insertAt = Math.max(0, Math.min(insertAt, dst.options.length));
            dst.options.splice(insertAt, 0, drag.option);
            return next;
          });
        }
      }
      clearDragState();
      cleanup();
    }

    function cancel() {
      window.Telegram?.WebApp?.enableVerticalSwipes?.();
      clearDragState();
      cleanup();
    }

    function cleanup() {
      document.body.style.userSelect = '';
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
      {sessionClosed && (
        <div style={styles.closedBanner}>🔒 Voting closed</div>
      )}

      <div style={styles.grid}>
        {rows.map(({ tier, options }) => {
          const meta = TIER_META[tier];
          const isTargeted = overTier === tier && activeOption !== null;
          return (
            <div
              key={tier}
              ref={el => {
                if (el) rowRefs.current.set(tier, el);
                else rowRefs.current.delete(tier);
              }}
              style={{
                ...styles.row,
                outline: isTargeted ? '2px solid var(--accent)' : '2px solid transparent',
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
                {options.map((opt, i) => {
                  const isDragging = activeOption === opt;
                  const showIndicator = isTargeted && overIndex === i && !isDragging;
                  return (
                    <span key={opt} style={{ display: 'contents' }}>
                      {/* Drop indicator line before this chip */}
                      {showIndicator && <DropIndicator />}
                      <span
                        ref={el => {
                          const key = `${tier}-${opt}`;
                          if (el) chipRefs.current.set(key, el);
                          else chipRefs.current.delete(key);
                        }}
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
                    </span>
                  );
                })}
                {/* Indicator after the last chip */}
                {isTargeted && overIndex === options.length && <DropIndicator />}
                {options.length === 0 && (
                  <span style={styles.emptyHint}>drop here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canDrag && rows.length > 1 && (
        <div style={styles.dragHint}>Hold &amp; drag chips to rearrange</div>
      )}

      {/* Floating ghost chip during drag */}
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

function DropIndicator() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 2,
        height: 20,
        background: 'var(--accent)',
        borderRadius: 1,
        flexShrink: 0,
        alignSelf: 'center',
      }}
    />
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

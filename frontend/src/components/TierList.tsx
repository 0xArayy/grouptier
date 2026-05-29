import { useEffect, useRef, useState } from 'react';
import styles from './TierList.module.css';

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

const TIER_META: Record<Tier, { bg: string }> = {
  S: { bg: 'oklch(0.65 0.22 25)' },
  A: { bg: 'oklch(0.72 0.18 50)' },
  B: { bg: 'oklch(0.85 0.16 90)' },
  C: { bg: 'oklch(0.70 0.18 140)' },
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

export function TierList({
  rankedList,
  sessionClosed,
  onSubmit,
  onViewGroup,
  submitting,
  submitError,
}: Props) {
  const [rows, setRows] = useState<TierRow[]>(() => buildRows(rankedList));

  const [activeOption, setActiveOption] = useState<string | null>(null);
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [overTier, setOverTier] = useState<Tier | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const overTierRef = useRef<Tier | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const dragRef = useRef<{ option: string; fromTier: Tier; fromIndex: number } | null>(null);
  const rowRefs = useRef<Map<Tier, HTMLDivElement>>(new Map());
  const chipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const cleanupRef = useRef<(() => void) | null>(null);

  const canDrag = !sessionClosed && !submitting && rows.length > 1;

  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    [],
  );

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

  function hitTestPosition(x: number, y: number): { tier: Tier; index: number } | null {
    for (const [tier, el] of rowRefs.current) {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
        const tierOptions = rows.find((r) => r.tier === tier)?.options ?? [];
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

    const fromIndex = rows.find((r) => r.tier === fromTier)?.options.indexOf(option) ?? 0;
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
          setRows((prev) => {
            const next = prev.map((r) => ({ ...r, options: [...r.options] }));
            const src = next.find((r) => r.tier === drag.fromTier);
            const dst = next.find((r) => r.tier === target);
            if (!src || !dst) return prev;
            src.options = src.options.filter((o) => o !== drag.option);
            let insertAt: number;
            if (drag.fromTier === target) {
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
    onSubmit(rows.flatMap((r) => r.options));
  }

  return (
    <div className={styles.container}>
      {sessionClosed && <div className={styles.closedBanner}>🔒 Голосование закрыто</div>}

      <div className={styles.screenMono}>РАССТАНОВКА ТИРОВ</div>
      <div className={styles.screenTitle}>Расставь по местам</div>
      <div className={styles.screenSub}>Удерживай чип и перетаскивай между тирами.</div>

      <div className={styles.grid}>
        {rows.map(({ tier, options }) => {
          const meta = TIER_META[tier];
          const isTargeted = overTier === tier && activeOption !== null;
          return (
            <div
              key={tier}
              ref={(el) => {
                if (el) rowRefs.current.set(tier, el);
                else rowRefs.current.delete(tier);
              }}
              className={`${styles.row}${isTargeted ? ` ${styles.rowTargeted}` : ''}`}
            >
              <div className={styles.tierLabel} style={{ background: meta.bg }}>
                {tier}
              </div>
              <div className={styles.chips}>
                {options.map((opt, i) => {
                  const isDragging = activeOption === opt;
                  const showIndicator = isTargeted && overIndex === i && !isDragging;
                  return (
                    <span key={opt} style={{ display: 'contents' }}>
                      {showIndicator && <DropIndicator />}
                      <span
                        ref={(el) => {
                          const key = `${tier}-${opt}`;
                          if (el) chipRefs.current.set(key, el);
                          else chipRefs.current.delete(key);
                        }}
                        className={`${styles.chip}${isDragging ? ` ${styles.chipGrabbing}` : canDrag ? ` ${styles.chipGrab}` : ''}`}
                        onPointerDown={(e) => onChipPointerDown(e, opt, tier)}
                      >
                        {opt}
                      </span>
                    </span>
                  );
                })}
                {isTargeted && overIndex === options.length && <DropIndicator />}
                {options.length === 0 && <span className={styles.emptyHint}>перетащи сюда</span>}
              </div>
            </div>
          );
        })}
      </div>

      {canDrag && rows.length > 1 && (
        <div className={styles.dragHint}>
          <span>⊕</span> Удерживай и перетаскивай
        </div>
      )}

      {floatPos && activeOption && (
        <div className={styles.floatingChip} style={{ left: floatPos.x - 40, top: floatPos.y - 16 }}>
          {activeOption}
        </div>
      )}

      {submitError && <div className={styles.submitError}>{submitError}</div>}

      <div className={styles.footer}>
        {onSubmit && !sessionClosed && (
          <button
            type="button"
            className={styles.submitBtn}
            style={{ opacity: submitting ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Сохраняем…' : 'Подтвердить выбор'}
          </button>
        )}
        {onViewGroup && (
          <button type="button" className={styles.groupBtn} onClick={onViewGroup}>
            Смотреть итоги →
          </button>
        )}
      </div>
    </div>
  );
}

function DropIndicator() {
  return <span className={styles.dropIndicator} />;
}

import { useState } from 'react';

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
  onClose?: () => void;
  closing?: boolean;
  onSaveTemplate?: (name: string, emoji: string) => Promise<void>;
  sessionId?: string;
  initialSaved?: boolean;
}

const TIER_META = [
  { tier: 'S', bg: 'var(--tier-s)', text: 'var(--tier-s-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
  { tier: 'A', bg: 'var(--tier-a)', text: 'var(--tier-a-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
  { tier: 'B', bg: 'var(--tier-b)', text: 'var(--tier-b-text)', shadow: '0 2px 0 rgba(255,255,255,0.4)' },
  { tier: 'C', bg: 'var(--tier-c)', text: 'var(--tier-c-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
];

const EMOJI_PRESETS = [
  '🍕','🍺','🎮','🎬','📺','🎵','🏖️','🎯',
  '🎲','🏆','🎉','🔥','⭐','💡','🎭','🎨',
  '🌍','🏅','🎸','🍜','🧩','🚀','💎','🎪',
  '🍔','🥂','🎳','📸','🌮','🎤','🎺','🃏',
];

function assignTiers(ranking: BordaEntry[]) {
  const n = ranking.length;
  if (n === 0) return [];
  const size = Math.ceil(n / 4);
  return TIER_META.map((meta, i) => ({
    ...meta,
    items: ranking.slice(i * size, (i + 1) * size),
  })).filter(t => t.items.length > 0);
}

export function LiveResults({
  sessionName,
  bordaRanking,
  resultCount,
  voterCount,
  sessionClosed,
  onShare,
  onClose,
  closing,
  onSaveTemplate,
  initialSaved = false,
}: Props) {
  const tiers = assignTiers(bordaRanking);
  const maxScore = bordaRanking[0]?.score ?? 1;
  const voteProgress = voterCount > 0 ? (resultCount / voterCount) * 100 : 0;

  const defaultName = sessionName || 'Мои опрос';
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState(defaultName);
  const [saveEmoji, setSaveEmoji] = useState('📝');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [saveError, setSaveError] = useState('');

  function openSaveForm() {
    setSaveName(defaultName);
    setSaveEmoji('📝');
    setSaveError('');
    setShowSaveForm(true);
  }

  function cancelSave() {
    setShowSaveForm(false);
    setSaveName(defaultName);
    setSaveEmoji('📝');
    setSaveError('');
  }

  async function confirmSave() {
    if (!onSaveTemplate || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSaveTemplate(saveName.trim() || defaultName, saveEmoji);
      setShowSaveForm(false);
      setSaved(true);
    } catch {
      setSaveError('Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerRow}>
        <div style={styles.headerText}>
          <div style={styles.eyebrow}>{sessionName.toUpperCase()} · BORDA</div>
          <div style={styles.title}>Group tier list</div>
        </div>
        {!sessionClosed && (
          <div style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </div>
        )}
        {sessionClosed && (
          <div style={styles.closedBadge}>🔒 FINAL</div>
        )}
      </div>

      {/* Voter progress bar */}
      {voterCount > 0 && (
        <div style={styles.voterRow}>
          <div style={styles.voterTrack}>
            <div style={{ ...styles.voterFill, width: `${voteProgress}%` }} />
          </div>
          <span style={styles.voterCount}>{resultCount}/{voterCount} voted</span>
        </div>
      )}

      {bordaRanking.length === 0 ? (
        <div style={styles.empty}>No votes yet. Be the first!</div>
      ) : (
        <div style={styles.tierRows}>
          {tiers.map(({ tier, bg, text, shadow, items }) => (
            <div key={tier} style={styles.tierRow}>
              <div style={{
                ...styles.tierBlock,
                background: bg,
                color: text,
                textShadow: shadow,
              }}>
                {tier}
              </div>
              <div style={styles.bordaItems}>
                {items.map(entry => (
                  <div key={entry.option} style={styles.bordaItem}>
                    <span style={styles.itemName}>{entry.option}</span>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barFill,
                        width: `${(entry.score / maxScore) * 100}%`,
                        background: bg,
                      }} />
                    </div>
                    <span style={styles.itemScore}>{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save template form — above footer */}
      {onSaveTemplate && showSaveForm && (
        <div style={styles.saveForm}>
          <input
            style={styles.saveNameInput}
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            maxLength={100}
            placeholder="Название шаблона"
          />
          <div style={styles.emojiGrid}>
            {EMOJI_PRESETS.map(e => (
              <button
                key={e}
                style={{
                  ...styles.emojiCell,
                  background: saveEmoji === e ? 'var(--bg)' : 'transparent',
                  outline: saveEmoji === e ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onClick={() => setSaveEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
          {saveError && <div style={styles.saveError}>{saveError}</div>}
          <div style={styles.saveFormBtns}>
            <button
              style={{ ...styles.saveConfirmBtn, opacity: saving ? 0.6 : 1 }}
              onClick={confirmSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить шаблон'}
            </button>
            <button style={styles.saveCancelBtn} onClick={cancelSave} disabled={saving}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Footer buttons */}
      <div style={styles.footer}>
        {onShare && (
          <button style={styles.shareBtn} onClick={onShare}>
            ↗ Share
          </button>
        )}
        {onSaveTemplate && (
          <button
            style={{
              ...styles.saveBtn,
              opacity: saved ? 0.7 : 1,
              cursor: saved ? 'default' : 'pointer',
            }}
            onClick={saved ? undefined : openSaveForm}
            disabled={saved}
          >
            {saved ? 'Сохранено ✓' : '💾 Сохранить'}
          </button>
        )}
        {onClose && !sessionClosed && (
          <button
            style={{ ...styles.closeBtn, opacity: closing ? 0.6 : 1 }}
            onClick={onClose}
            disabled={closing}
          >
            {closing ? 'Closing…' : '🔒 Close & announce'}
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
    gap: 0,
    padding: '0 0 16px',
    flex: 1,
    overflowY: 'auto',
  },
  headerRow: {
    padding: '10px 16px 4px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: 'var(--text-hint)',
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: 'var(--text)',
  },
  liveBadge: {
    fontSize: 10,
    padding: '4px 8px 4px 6px',
    borderRadius: 10,
    background: 'var(--progress)',
    color: '#fff',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    background: '#fff',
    animation: 'gtPulse 1.2s infinite',
  } as React.CSSProperties,
  closedBadge: {
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 10,
    background: 'var(--surface)',
    color: 'var(--text-hint)',
    fontWeight: 700,
    flexShrink: 0,
  },
  voterRow: {
    padding: '0 16px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  voterTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    background: 'var(--surface)',
    overflow: 'hidden',
  },
  voterFill: {
    height: '100%',
    background: 'var(--progress)',
    borderRadius: 3,
    transition: 'width 0.4s ease',
  },
  voterCount: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text)',
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--text-hint)',
    marginTop: 32,
    fontSize: 15,
    padding: '0 16px',
  },
  tierRows: {
    padding: '4px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  tierRow: {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    background: 'var(--surface)',
    boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
  },
  tierBlock: {
    width: 52,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: -1,
    flexShrink: 0,
  },
  bordaItems: {
    flex: 1,
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    justifyContent: 'center',
  },
  bordaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text)',
    width: 72,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s ease',
  },
  itemScore: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text)',
    width: 20,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  saveForm: {
    margin: '8px 14px 0',
    padding: '12px 14px',
    background: 'var(--surface)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  saveNameInput: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg)',
    border: '1px solid transparent',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    boxSizing: 'border-box' as const,
  },
  emojiGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  emojiCell: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    borderRadius: 6,
    cursor: 'pointer',
    outlineOffset: 1,
  },
  saveError: {
    fontSize: 12,
    color: 'var(--tier-s)',
    textAlign: 'center' as const,
  },
  saveFormBtns: {
    display: 'flex',
    gap: 8,
  },
  saveConfirmBtn: {
    flex: 1,
    padding: '12px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    minHeight: 'var(--tap-target-min)',
    cursor: 'pointer',
    boxShadow: '0 2px 8px var(--accent-shadow)',
    transition: 'opacity 0.15s',
  },
  saveCancelBtn: {
    flex: 1,
    padding: '12px',
    background: 'var(--bg)',
    color: 'var(--text-hint)',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    minHeight: 'var(--tap-target-min)',
    cursor: 'pointer',
  },
  footer: {
    padding: '8px 14px 0',
    display: 'flex',
    gap: 8,
  },
  shareBtn: {
    flex: 1,
    padding: '12px',
    background: 'var(--surface)',
    color: 'var(--accent)',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 700,
    minHeight: 'var(--tap-target-min)',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    background: 'var(--surface)',
    color: 'var(--accent)',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 700,
    minHeight: 'var(--tap-target-min)',
    transition: 'opacity 0.15s',
  },
  closeBtn: {
    flex: 1.4,
    padding: '12px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 800,
    minHeight: 'var(--tap-target-min)',
    cursor: 'pointer',
    boxShadow: '0 2px 8px var(--accent-shadow)',
  },
};

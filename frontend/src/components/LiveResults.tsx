import { useState } from 'react';
import { DEFAULT_SAVE_EMOJI, EMOJI_PRESETS } from '../lib/constants.ts';
import styles from './LiveResults.module.css';

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
  initialSaved?: boolean;
  onNewPoll?: () => void;
}

const TIER_META = [
  { tier: 'S', bg: 'var(--tier-s)', text: 'var(--tier-s-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
  { tier: 'A', bg: 'var(--tier-a)', text: 'var(--tier-a-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
  { tier: 'B', bg: 'var(--tier-b)', text: 'var(--tier-b-text)', shadow: '0 2px 0 rgba(255,255,255,0.4)' },
  { tier: 'C', bg: 'var(--tier-c)', text: 'var(--tier-c-text)', shadow: '0 2px 0 rgba(0,0,0,0.22)' },
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
  onNewPoll,
}: Props) {
  const tiers = assignTiers(bordaRanking);
  const maxScore = bordaRanking[0]?.score ?? 1;
  const voteProgress = voterCount > 0 ? (resultCount / voterCount) * 100 : 0;

  const defaultName = sessionName || 'Без названия';
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState(defaultName);
  const [saveEmoji, setSaveEmoji] = useState(DEFAULT_SAVE_EMOJI);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [saveError, setSaveError] = useState('');

  function resetSaveForm() {
    setSaveName(defaultName);
    setSaveEmoji(DEFAULT_SAVE_EMOJI);
    setSaveError('');
  }

  function openSaveForm() {
    resetSaveForm();
    setShowSaveForm(true);
  }

  function cancelSave() {
    setShowSaveForm(false);
    resetSaveForm();
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
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <div className={styles.eyebrow}>{sessionName.toUpperCase()} · BORDA</div>
          <div className={styles.title}>Group tier list</div>
        </div>
        {!sessionClosed && (
          <div className={styles.liveBadge}>
            <span className={styles.liveDot} />
            LIVE
          </div>
        )}
        {sessionClosed && (
          <div className={styles.closedBadge}>🔒 FINAL</div>
        )}
      </div>

      {/* Voter progress bar */}
      {voterCount > 0 && (
        <div className={styles.voterRow}>
          <div className={styles.voterTrack}>
            <div className={styles.voterFill} style={{ width: `${voteProgress}%` }} />
          </div>
          <span className={styles.voterCount}>{resultCount}/{voterCount} voted</span>
        </div>
      )}

      {bordaRanking.length === 0 ? (
        <div className={styles.empty}>No votes yet. Be the first!</div>
      ) : (
        <div className={styles.tierRows}>
          {tiers.map(({ tier, bg, text, shadow, items }) => (
            <div key={tier} className={styles.tierRow}>
              <div
                className={styles.tierBlock}
                style={{ background: bg, color: text, textShadow: shadow }}
              >
                {tier}
              </div>
              <div className={styles.bordaItems}>
                {items.map(entry => (
                  <div key={entry.option} className={styles.bordaItem}>
                    <span className={styles.itemName}>{entry.option}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(entry.score / maxScore) * 100}%`,
                          background: bg,
                        }}
                      />
                    </div>
                    <span className={styles.itemScore}>{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save template form — above footer */}
      {onSaveTemplate && showSaveForm && (
        <div className={styles.saveForm}>
          <input
            className={styles.saveNameInput}
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            maxLength={100}
            placeholder="Название шаблона"
          />
          <div className={styles.emojiGrid}>
            {EMOJI_PRESETS.map(e => (
              <button
                key={e}
                className={`${styles.emojiCell}${saveEmoji === e ? ` ${styles.emojiCellActive}` : ''}`}
                onClick={() => setSaveEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
          {saveError && <div className={styles.saveError}>{saveError}</div>}
          <div className={styles.saveFormBtns}>
            <button
              className={styles.saveConfirmBtn}
              style={{ opacity: saving ? 0.6 : 1 }}
              onClick={confirmSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить шаблон'}
            </button>
            <button className={styles.saveCancelBtn} onClick={cancelSave} disabled={saving}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Footer buttons */}
      <div className={styles.footer}>
        {onShare && (
          <button className={styles.shareBtn} onClick={onShare}>
            ↗ Share
          </button>
        )}
        {onSaveTemplate && (
          <button
            className={styles.saveBtn}
            style={{ opacity: saved ? 0.7 : 1, cursor: saved ? 'default' : 'pointer' }}
            onClick={saved ? undefined : openSaveForm}
            disabled={saved}
          >
            {saved ? 'Сохранено ✓' : '💾 Сохранить'}
          </button>
        )}
        {onClose && !sessionClosed && (
          <button
            className={styles.closeBtn}
            style={{ opacity: closing ? 0.6 : 1 }}
            onClick={onClose}
            disabled={closing}
          >
            {closing ? 'Closing…' : '🔒 Close & announce'}
          </button>
        )}
      </div>
      {sessionClosed && onNewPoll && (
        <div className={styles.newPollWrap}>
          <button className={styles.newPollBtn} onClick={onNewPoll}>
            + Новый опрос
          </button>
        </div>
      )}
    </div>
  );
}

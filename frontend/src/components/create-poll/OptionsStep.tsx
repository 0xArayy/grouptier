import { useState } from 'react';
import { EMOJI_PRESETS } from '../../lib/constants.ts';
import styles from './OptionsStep.module.css';

interface Props {
  sessionName: string;
  options: string[];
  optionInput: string;
  setOptionInput: (v: string) => void;
  error: string;
  busy: boolean;
  removingOption: string | null;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  nameInput: string;
  setNameInput: (v: string) => void;
  externalEdit: boolean;
  savedId: string | null;
  showSaveForm: boolean;
  setShowSaveForm: (v: boolean) => void;
  saveEmoji: string;
  setSaveEmoji: (v: string) => void;
  saving: boolean;
  saveSuccess: boolean;
  shareUrl: string | null;
  onBack: () => void;
  onAddOption: () => void;
  onRemoveOption: (text: string) => void;
  onStartVoting: () => void;
  onSaveTemplate: () => void;
  onSaveName: () => void;
  onGenerateWithAi?: () => void;
}

export function OptionsStep({
  sessionName, options, optionInput, setOptionInput, error, busy, removingOption,
  editingName, setEditingName, nameInput, setNameInput, externalEdit,
  savedId, showSaveForm, setShowSaveForm, saveEmoji, setSaveEmoji,
  saving, saveSuccess, shareUrl,
  onBack, onAddOption, onRemoveOption, onStartVoting, onSaveTemplate, onSaveName,
  onGenerateWithAi,
}: Props) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  function handleShare() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }).catch(() => {});
  }

  const votingLabel = `Запустить голосование (${options.length} вар${options.length === 1 ? 'иант' : options.length < 5 ? 'ианта' : 'иантов'})`;

  return (
    <div className={styles.container}>
      {busy && options.length === 0 && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
          <div className={styles.loadingText}>Загружаем варианты…</div>
        </div>
      )}

      <div className={styles.navRow}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        {shareUrl && (
          <button
            onClick={handleShare}
            className={`${styles.shareBtn}${shareCopied ? ` ${styles.shareBtnCopied}` : ''}`}
            title="Поделиться ссылкой для добавления вариантов"
          >
            {shareCopied ? '✓ Скопировано' : 'Поделиться'}
          </button>
        )}
      </div>

      <div className={styles.content}>
        {editingName ? (
          <input
            autoFocus
            className={styles.nameInput}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={onSaveName}
            onKeyDown={e => e.key === 'Enter' && onSaveName()}
          />
        ) : (
          <div
            onClick={() => { setNameInput(sessionName); setEditingName(true); }}
            className={styles.nameDisplay}
          >
            {sessionName || 'Без названия'}
            <span className={styles.nameEditIcon}>✏️</span>
          </div>
        )}

        <div className={externalEdit ? styles.hintCompact : styles.hint}>
          Добавь или удали варианты, затем запускай.
        </div>

        {externalEdit && (
          <div className={styles.externalEditBanner}>
            <span className={styles.liveIndicator} />
            Кто-то редактирует список…
          </div>
        )}

        {options.length > 0 && (
          <div className={styles.optionsList}>
            {options.map((opt, i) => (
              <div key={opt} className={styles.optionRow}>
                <span className={styles.optionText}>{i + 1}. {opt}</span>
                <button
                  onClick={() => onRemoveOption(opt)}
                  disabled={removingOption === opt || busy}
                  className={styles.optionRemoveBtn}
                  aria-label={`Удалить ${opt}`}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {options.length < 4 && onGenerateWithAi && (
          <button
            onClick={onGenerateWithAi}
            disabled={busy}
            className={styles.aiLink}
          >✨ Предложить варианты</button>
        )}

        {options.length < 32 && (
          <div className={styles.addRow}>
            <div className={styles.addInputGroup}>
              <input
                className={styles.addInput}
                placeholder="Добавить вариант…"
                maxLength={100}
                value={optionInput}
                onChange={e => setOptionInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddOption()}
              />
              <button
                onClick={onAddOption}
                disabled={!optionInput.trim() || busy}
                className={styles.addBtn}
              >+</button>
            </div>
            {optionInput.length >= 80 && (
              <div className={`${styles.charCount}${optionInput.length >= 100 ? ` ${styles.charCountWarn}` : ''}`}>
                {optionInput.length}/100
              </div>
            )}
          </div>
        )}

        {error && <div className={styles.errorText}>{error}</div>}

        <button
          className={styles.startBtn}
          style={{ opacity: (options.length < 2 || busy) ? 0.5 : 1 }}
          disabled={options.length < 2 || busy}
          onClick={onStartVoting}
        >{votingLabel}</button>

        <div className={styles.saveSection}>
          {saveSuccess && (
            <div className={styles.saveSuccess}>✓ Шаблон сохранён</div>
          )}
          {showSaveForm ? (
            <div className={styles.saveForm}>
              <div className={styles.saveFormTitle}>
                {savedId ? 'Обновить шаблон' : 'Сохранить как шаблон'}
              </div>
              <div className={styles.saveFormTop}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`${styles.emojiPickerToggle}${showEmojiPicker ? ` ${styles.emojiPickerToggleOpen}` : ''}`}
                >{saveEmoji}</button>
                <div className={styles.saveFormInfo}>
                  «{sessionName}» · {options.length} вариантов
                </div>
              </div>
              {showEmojiPicker && (
                <div className={styles.emojiGrid}>
                  {EMOJI_PRESETS.map(e => (
                    <button
                      key={e}
                      onClick={() => { setSaveEmoji(e); setShowEmojiPicker(false); }}
                      className={`${styles.emojiCell}${saveEmoji === e ? ` ${styles.emojiCellActive}` : ''}`}
                    >{e}</button>
                  ))}
                </div>
              )}
              <div className={styles.saveFormBtns}>
                <button onClick={() => setShowSaveForm(false)} className={styles.cancelBtn}>
                  Отмена
                </button>
                <button
                  onClick={onSaveTemplate}
                  disabled={saving}
                  className={styles.saveConfirmBtn}
                >
                  {saving ? 'Сохраняем…' : (savedId ? 'Обновить' : 'Сохранить')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => options.length >= 2 && setShowSaveForm(true)}
              disabled={options.length < 2}
              className={styles.saveTemplateBtn}
            >
              <span>💾</span>
              <span>{savedId ? 'Обновить шаблон' : 'Сохранить шаблон'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

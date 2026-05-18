import { useState } from 'react';
import { EMOJI_PRESETS } from '../../lib/constants.ts';

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
  onBack: () => void;
  onAddOption: () => void;
  onRemoveOption: (text: string) => void;
  onStartVoting: () => void;
  onSaveTemplate: () => void;
  onSaveName: () => void;
}

export function OptionsStep({
  sessionName, options, optionInput, setOptionInput, error, busy, removingOption,
  editingName, setEditingName, nameInput, setNameInput, externalEdit,
  savedId, showSaveForm, setShowSaveForm, saveEmoji, setSaveEmoji,
  saving, saveSuccess,
  onBack, onAddOption, onRemoveOption, onStartVoting, onSaveTemplate, onSaveName,
}: Props) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const primaryBtn: React.CSSProperties = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    boxShadow: '0 2px 8px var(--accent-shadow)',
    minHeight: 'var(--tap-target-min)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--surface)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 15,
    boxSizing: 'border-box',
  };

  const votingLabel = `Запустить голосование (${options.length} вар${options.length === 1 ? 'иант' : options.length < 5 ? 'ианта' : 'иантов'})`;

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
        >←</button>
      </div>

      <div style={{ padding: '12px 16px 24px' }}>
        {editingName ? (
          <input
            autoFocus
            style={{
              fontSize: 16, fontWeight: 700, width: '100%',
              border: 'none', borderBottom: '2px solid var(--accent)',
              background: 'transparent', color: 'var(--text)',
              padding: '2px 0', marginBottom: 2, outline: 'none', boxSizing: 'border-box',
            }}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={onSaveName}
            onKeyDown={e => e.key === 'Enter' && onSaveName()}
          />
        ) : (
          <div
            onClick={() => { setNameInput(sessionName); setEditingName(true); }}
            style={{ fontSize: 16, fontWeight: 700, marginBottom: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {sessionName || 'Без названия'}
            <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 400 }}>✏️</span>
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: externalEdit ? 10 : 20 }}>
          Добавь или удали варианты, затем запускай.
        </div>

        {externalEdit && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            borderRadius: 'var(--radius-md)', background: 'var(--surface)',
            fontSize: 13, color: 'var(--text-hint)', fontWeight: 500, marginBottom: 14,
            animation: 'fadeIn 0.2s ease',
          }}>
            <span style={{ animation: 'gtPulse 1.2s infinite', display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            Кто-то редактирует список…
          </div>
        )}

        {options.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {options.map((opt, i) => (
              <div key={opt} style={{
                padding: '9px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface)',
                marginBottom: 6, fontSize: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 8,
              }}>
                <span style={{ color: 'var(--text)' }}>{i + 1}. {opt}</span>
                <button
                  onClick={() => onRemoveOption(opt)}
                  disabled={removingOption === opt || busy}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-hint)',
                    cursor: (removingOption === opt || busy) ? 'not-allowed' : 'pointer',
                    fontSize: 18, lineHeight: 1, padding: '2px 4px',
                    opacity: removingOption === opt ? 0.3 : 0.5, flexShrink: 0,
                  }}
                  aria-label={`Удалить ${opt}`}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {options.length < 12 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Добавить вариант…"
              value={optionInput}
              onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onAddOption()}
            />
            <button
              onClick={onAddOption}
              disabled={!optionInput.trim() || busy}
              style={{
                padding: '12px 16px', borderRadius: 'var(--radius-md)', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 15,
                cursor: (!optionInput.trim() || busy) ? 'not-allowed' : 'pointer',
                opacity: (!optionInput.trim() || busy) ? 0.5 : 1,
              }}
            >+</button>
          </div>
        )}

        {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <button
          style={{ ...primaryBtn, opacity: (options.length < 2 || busy) ? 0.5 : 1 }}
          disabled={options.length < 2 || busy}
          onClick={onStartVoting}
        >{votingLabel}</button>

        <div style={{ marginTop: 12 }}>
          {saveSuccess && (
            <div style={{ fontSize: 13, color: '#7ED957', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>
              ✓ Шаблон сохранён
            </div>
          )}
          {showSaveForm ? (
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hint)', marginBottom: 10 }}>
                {savedId ? 'Обновить шаблон' : 'Сохранить как шаблон'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: showEmojiPicker ? 8 : 10 }}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={{
                    width: 56, height: 48, flexShrink: 0, fontSize: 26, lineHeight: 1,
                    borderRadius: 'var(--radius-md)',
                    border: showEmojiPicker ? '2px solid var(--accent)' : '1px solid var(--surface)',
                    background: 'var(--bg)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >{saveEmoji}</button>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-hint)', display: 'flex', alignItems: 'center' }}>
                  «{sessionName}» · {options.length} вариантов
                </div>
              </div>
              {showEmojiPicker && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
                  marginBottom: 10, padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-md)',
                }}>
                  {EMOJI_PRESETS.map(e => (
                    <button
                      key={e}
                      onClick={() => { setSaveEmoji(e); setShowEmojiPicker(false); }}
                      style={{
                        fontSize: 22, lineHeight: 1, padding: '6px 0', border: 'none',
                        background: saveEmoji === e ? 'var(--surface)' : 'transparent',
                        borderRadius: 6, cursor: 'pointer',
                      }}
                    >{e}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowSaveForm(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none',
                    background: 'var(--bg)', color: 'var(--text-hint)', fontSize: 14, cursor: 'pointer',
                  }}
                >Отмена</button>
                <button
                  onClick={onSaveTemplate}
                  disabled={saving}
                  style={{
                    flex: 2, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none',
                    background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  }}
                >{saving ? 'Сохраняем…' : (savedId ? 'Обновить' : 'Сохранить')}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => options.length >= 2 && setShowSaveForm(true)}
              disabled={options.length < 2}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--surface)', background: 'transparent',
                color: 'var(--text-hint)', fontSize: 14,
                cursor: options.length < 2 ? 'not-allowed' : 'pointer',
                opacity: options.length < 2 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
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

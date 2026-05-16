import { useState, useEffect } from 'react';
import {
  createSession,
  addOption,
  removeOption,
  startVoting,
  updateSessionName,
  fetchSavedPolls,
  createSavedPoll,
  updateSavedPoll,
  deleteSavedPoll,
  type SavedPoll,
} from '../api/client.ts';

interface Props {
  onSessionReady: (sessionId: string) => void;
  existingSession?: { id: string; name: string; options: string[] };
}

type Step = 'home' | 'presets' | 'my-polls' | 'options' | 'starting';

const PRESETS: { emoji: string; label: string; name: string; options: string[] }[] = [
  {
    emoji: '🍕',
    label: 'Еда',
    name: 'Что будем есть?',
    options: ['Пицца', 'Суши', 'Бургеры', 'Тако', 'Рамен', 'Паста', 'Тайская', 'Салат'],
  },
  {
    emoji: '🎮',
    label: 'Игры',
    name: 'Во что сыграем?',
    options: ['Minecraft', 'Valorant', 'CS2', 'Among Us', 'Stardew Valley', 'Rocket League', 'Fortnite', 'League of Legends'],
  },
  {
    emoji: '🎬',
    label: 'Кино',
    name: 'Какой жанр сегодня?',
    options: ['Боевик', 'Комедия', 'Ужасы', 'Романтика', 'Фантастика', 'Триллер', 'Анимация', 'Документалка'],
  },
  {
    emoji: '📺',
    label: 'Сериал',
    name: 'Какой сериал смотрим?',
    options: ['Breaking Bad', 'Game of Thrones', 'The Bear', 'Severance', 'Succession', 'The Wire', 'Chernobyl', 'Dark'],
  },
  {
    emoji: '🎵',
    label: 'Музыка',
    name: 'Какую музыку ставим?',
    options: ['Хип-хоп', 'Поп', 'Рок', 'Электронная', 'Джаз', 'R&B', 'Классика', 'Инди'],
  },
  {
    emoji: '🏖️',
    label: 'Отдых',
    name: 'Куда едем?',
    options: ['Море', 'Горы', 'Город', 'Дача', 'Кемпинг', 'Экскурсии', 'Спа', 'Остаёмся дома'],
  },
  {
    emoji: '🎯',
    label: 'Досуг',
    name: 'Чем займёмся?',
    options: ['Боулинг', 'Кино', 'Бар', 'Парк', 'Квест', 'Настолки', 'Каток', 'Кафе'],
  },
  {
    emoji: '🍺',
    label: 'Напитки',
    name: 'Что пьём?',
    options: ['Пиво', 'Вино', 'Коктейли', 'Виски', 'Текила', 'Просекко', 'Безалкогольное', 'Чай'],
  },
];

export function CreatePoll({ onSessionReady, existingSession }: Props) {
  const hasExistingOptions = (existingSession?.options.length ?? 0) > 0;
  const [step, setStep] = useState<Step>(hasExistingOptions ? 'options' : 'home');
  const [sessionId, setSessionId] = useState<string | null>(existingSession?.id ?? null);
  const [sessionName, setSessionName] = useState(existingSession?.name ?? '');
  const [options, setOptions] = useState<string[]>(existingSession?.options ?? []);
  const [optionInput, setOptionInput] = useState('');
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingOption, setRemovingOption] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(existingSession?.name ?? '');

  // saved polls state
  const [savedPolls, setSavedPolls] = useState<SavedPoll[]>([]);
  const [savedPollsLoading, setSavedPollsLoading] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveEmoji, setSaveEmoji] = useState('📝');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null); // id of template this session was loaded from
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadSavedPolls();
  }, []);

  async function loadSavedPolls() {
    setSavedPollsLoading(true);
    try {
      const polls = await fetchSavedPolls();
      setSavedPolls(polls);
    } catch {
      // silently ignore — saved polls are a convenience feature
    } finally {
      setSavedPollsLoading(false);
    }
  }

  async function handleSaveName() {
    if (!sessionId || !nameInput.trim() || nameInput.trim() === sessionName) {
      setEditingName(false);
      return;
    }
    try {
      await updateSessionName(sessionId, nameInput.trim());
      setSessionName(nameInput.trim());
    } catch {
      setNameInput(sessionName);
    }
    setEditingName(false);
  }

  async function handleCreateCustom() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const name = customName.trim() || 'Без названия';
      if (sessionId) {
        if (customName.trim()) await updateSessionName(sessionId, name);
        setSessionName(name);
      } else {
        const { id } = await createSession(name);
        setSessionId(id);
        setSessionName(name);
      }
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      setError(msg.includes('409') ? 'В этой группе уже идёт сбор вариантов.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddOption() {
    if (!sessionId || !optionInput.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { options: updated } = await addOption(sessionId, optionInput.trim());
      setOptions(updated);
      setOptionInput('');
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePreset(preset: typeof PRESETS[number]) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let id = sessionId;
      if (id) {
        await updateSessionName(id, preset.name);
      } else {
        const res = await createSession(preset.name);
        id = res.id;
        setSessionId(id);
      }
      setSessionName(preset.name);
      const loaded: string[] = [];
      for (const opt of preset.options) {
        const { options: updated } = await addOption(id, opt);
        loaded.push(...updated.filter(o => !loaded.includes(o)));
      }
      setOptions(loaded);
      setSavedId(null);
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      setError(msg.includes('409') ? 'В этой группе уже идёт сбор вариантов.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavedPoll(poll: SavedPoll) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let id = sessionId;
      if (id) {
        await updateSessionName(id, poll.name);
      } else {
        const res = await createSession(poll.name);
        id = res.id;
        setSessionId(id);
      }
      setSessionName(poll.name);
      const loaded: string[] = [];
      for (const opt of poll.options) {
        const { options: updated } = await addOption(id, opt);
        loaded.push(...updated.filter(o => !loaded.includes(o)));
      }
      setOptions(loaded);
      setSavedId(poll.id);
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      setError(msg.includes('409') ? 'В этой группе уже идёт сбор вариантов.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveOption(text: string) {
    if (!sessionId || busy) return;
    setRemovingOption(text);
    setError('');
    try {
      const { options: updated } = await removeOption(sessionId, text);
      setOptions(updated);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setRemovingOption(null);
    }
  }

  async function handleStartVoting() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError('');
    setStep('starting');
    try {
      await startVoting(sessionId);
      onSessionReady(sessionId);
    } catch (err: unknown) {
      setError(String(err));
      setStep('options');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTemplate() {
    if (saving || options.length < 2) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      if (savedId) {
        // update existing template
        await updateSavedPoll(savedId, { name: sessionName, options, emoji: saveEmoji });
        setSavedPolls(prev => prev.map(p => p.id === savedId ? { ...p, name: sessionName, options, emoji: saveEmoji, updated_at: new Date().toISOString() } : p));
      } else {
        const { id } = await createSavedPoll(sessionName, options, saveEmoji);
        const newPoll: SavedPoll = { id, name: sessionName, options, emoji: saveEmoji, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        setSavedPolls(prev => [newPoll, ...prev]);
        setSavedId(id);
      }
      setShowSaveForm(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSavedPoll(id: string) {
    setDeletingId(id);
    try {
      await deleteSavedPoll(id);
      setSavedPolls(prev => prev.filter(p => p.id !== id));
      if (savedId === id) setSavedId(null);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setDeletingId(null);
    }
  }

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

  const pollCardStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '14px 12px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--surface)',
    background: 'var(--surface)',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    marginBottom: 10,
    textAlign: 'left',
  };

  // ── Home ──────────────────────────────────────────────────────────
  if (step === 'home') {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Создать опрос</div>
        <div style={{ fontSize: 14, color: 'var(--text-hint)', marginBottom: 24 }}>
          Выбери тему — группа проголосует и выберет лучший вариант.
        </div>

        {/* My saved polls shortcut */}
        <div style={{ marginBottom: 20 }}>
          <button
            style={{
              ...primaryBtn,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
            disabled={busy}
            onClick={() => setStep('my-polls')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⭐</span>
              <span>Мои опросы</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {savedPollsLoading ? (
                <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>…</span>
              ) : savedPolls.length > 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 500 }}>{savedPolls.length}</span>
              ) : null}
              <span style={{ fontSize: 18, color: 'var(--text-hint)' }}>›</span>
            </span>
          </button>
        </div>

        <button
          style={primaryBtn}
          disabled={busy}
          onClick={() => setStep('presets')}
        >
          Выбрать тему →
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--surface)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 500 }}>или</span>
          <div style={{ flex: 1, height: 1, background: 'var(--surface)' }} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Свой вариант
        </div>
        <input
          style={inputStyle}
          placeholder="Название опроса…"
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateCustom()}
          autoFocus
        />
        {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ marginTop: 10 }}>
          <button
            style={{
              ...primaryBtn,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: 'none',
              opacity: busy ? 0.5 : 1,
            }}
            disabled={busy}
            onClick={handleCreateCustom}
          >
            {busy ? 'Создаём…' : 'Создать пустой опрос'}
          </button>
        </div>
      </div>
    );
  }

  // ── My Polls ──────────────────────────────────────────────────────
  if (step === 'my-polls') {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto' }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--bg)',
          padding: '14px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--surface)',
        }}>
          <button
            onClick={() => setStep('home')}
            style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
          >
            ←
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Мои опросы</div>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', color: 'var(--accent)', fontSize: 13 }}>{error}</div>
        )}

        <div style={{ padding: '12px 16px 32px' }}>
          {savedPolls.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, padding: '40px 0' }}>
              Сохранённых опросов нет.<br />
              <span style={{ fontSize: 12 }}>Создай опрос и нажми «Сохранить шаблон».</span>
            </div>
          ) : (
            savedPolls.map(poll => (
              <div key={poll.id} style={{ position: 'relative', marginBottom: 10 }}>
                <button
                  onClick={() => handleSavedPoll(poll)}
                  disabled={busy}
                  style={pollCardStyle}
                >
                  <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{poll.emoji}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                      {poll.name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {poll.options.map(opt => (
                        <span
                          key={opt}
                          style={{
                            fontSize: 12,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--bg)',
                            color: 'var(--text-hint)',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: 'var(--text-hint)', flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }}>›</span>
                </button>
                {/* delete button */}
                <button
                  onClick={() => handleDeleteSavedPoll(poll.id)}
                  disabled={deletingId === poll.id || busy}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 40,
                    background: 'none',
                    border: 'none',
                    fontSize: 16,
                    cursor: (deletingId === poll.id || busy) ? 'not-allowed' : 'pointer',
                    opacity: deletingId === poll.id ? 0.3 : 0.5,
                    padding: '4px',
                    color: 'var(--text-hint)',
                    lineHeight: 1,
                  }}
                  aria-label={`Удалить ${poll.name}`}
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        {busy && (
          <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            gap: 12,
          }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Загружаем варианты…</div>
          </div>
        )}
      </div>
    );
  }

  // ── Preset picker ─────────────────────────────────────────────────
  if (step === 'presets') {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto' }}>
        {/* sticky header */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--bg)',
          padding: '14px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--surface)',
        }}>
          <button
            onClick={() => setStep('home')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-hint)',
              fontSize: 20,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Выбери тему</div>
        </div>

        {error && (
          <div style={{ padding: '10px 16px', color: 'var(--accent)', fontSize: 13 }}>{error}</div>
        )}

        {/* preset cards */}
        <div style={{ padding: '12px 16px 32px' }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              disabled={busy}
              style={pollCardStyle}
            >
              <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{p.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {p.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {p.options.map(opt => (
                    <span
                      key={opt}
                      style={{
                        fontSize: 12,
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--bg)',
                        color: 'var(--text-hint)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt}
                    </span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-hint)', flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }}>›</span>
            </button>
          ))}
        </div>

        {/* loading overlay */}
        {busy && (
          <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            gap: 12,
          }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Загружаем варианты…</div>
          </div>
        )}
      </div>
    );
  }

  // ── Options editor ────────────────────────────────────────────────
  if (step === 'options') {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 400, margin: '0 auto' }}>
        {editingName ? (
          <input
            autoFocus
            style={{
              fontSize: 16,
              fontWeight: 700,
              width: '100%',
              border: 'none',
              borderBottom: '2px solid var(--accent)',
              background: 'transparent',
              color: 'var(--text)',
              padding: '2px 0',
              marginBottom: 2,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
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
        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: 20 }}>
          Добавь или удали варианты, затем запускай.
        </div>

        {options.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {options.map((opt, i) => (
              <div key={i} style={{
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                marginBottom: 6,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <span style={{ color: 'var(--text)' }}>{i + 1}. {opt}</span>
                <button
                  onClick={() => handleRemoveOption(opt)}
                  disabled={removingOption === opt || busy}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-hint)',
                    cursor: (removingOption === opt || busy) ? 'not-allowed' : 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: '2px 4px',
                    opacity: removingOption === opt ? 0.3 : 0.5,
                    flexShrink: 0,
                  }}
                  aria-label={`Удалить ${opt}`}
                >
                  ×
                </button>
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
              onKeyDown={e => e.key === 'Enter' && handleAddOption()}
            />
            <button
              onClick={handleAddOption}
              disabled={!optionInput.trim() || busy}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: (!optionInput.trim() || busy) ? 'not-allowed' : 'pointer',
                opacity: (!optionInput.trim() || busy) ? 0.5 : 1,
              }}
            >
              +
            </button>
          </div>
        )}

        {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <button
          style={{ ...primaryBtn, opacity: (options.length < 2 || busy) ? 0.5 : 1 }}
          disabled={options.length < 2 || busy}
          onClick={handleStartVoting}
        >
          Запустить голосование ({options.length} вар{options.length === 1 ? 'иант' : options.length < 5 ? 'ианта' : 'иантов'})
        </button>

        {/* save template section */}
        {options.length >= 2 && (
          <div style={{ marginTop: 12 }}>
            {saveSuccess && (
              <div style={{ fontSize: 13, color: '#7ED957', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>
                ✓ Шаблон сохранён
              </div>
            )}
            {showSaveForm ? (
              <div style={{
                background: 'var(--surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hint)', marginBottom: 10 }}>
                  {savedId ? 'Обновить шаблон' : 'Сохранить как шаблон'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    style={{ ...inputStyle, width: 56, flexShrink: 0, textAlign: 'center', fontSize: 22, padding: '8px 6px' }}
                    value={saveEmoji}
                    onChange={e => setSaveEmoji(e.target.value)}
                    maxLength={4}
                    title="Иконка"
                  />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--text-hint)', display: 'flex', alignItems: 'center' }}>
                    «{sessionName}» · {options.length} вариантов
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowSaveForm(false)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: 'var(--bg)',
                      color: 'var(--text-hint)',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={saving}
                    style={{
                      flex: 2,
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Сохраняем…' : (savedId ? 'Обновить' : 'Сохранить')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveForm(true)}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--surface)',
                  background: 'transparent',
                  color: 'var(--text-hint)',
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>💾</span>
                <span>{savedId ? 'Обновить шаблон' : 'Сохранить шаблон'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Starting ──────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>📢</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Открываем голосование в группе…</div>
    </div>
  );
}

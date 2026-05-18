import { useState, useEffect, useRef } from 'react';
import {
  createSession,
  addOption,
  removeOption,
  startVoting,
  updateSessionName,
  fetchSessionOptions,
  fetchSavedPolls,
  createSavedPoll,
  updateSavedPoll,
  deleteSavedPoll,
  type SavedPoll,
} from '../api/client.ts';
import { HomeStep } from './create-poll/HomeStep.tsx';
import { PresetsStep, type Preset } from './create-poll/PresetsStep.tsx';
import { MyPollsStep } from './create-poll/MyPollsStep.tsx';
import { OptionsStep } from './create-poll/OptionsStep.tsx';
import { DEFAULT_SAVE_EMOJI } from '../lib/constants.ts';

interface Props {
  onSessionReady: (sessionId: string) => void;
  existingSession?: { id: string; name: string; options: string[] };
}

type Step = 'home' | 'presets' | 'my-polls' | 'options' | 'starting';


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

  const [savedPolls, setSavedPolls] = useState<SavedPoll[]>([]);
  const [savedPollsLoading, setSavedPollsLoading] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveEmoji, setSaveEmoji] = useState(DEFAULT_SAVE_EMOJI);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [startingTimedOut, setStartingTimedOut] = useState(false);
  const [externalEdit, setExternalEdit] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    if (step !== 'starting') { setStartingTimedOut(false); return; }
    const t = setTimeout(() => setStartingTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 'options' || !sessionId) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      return;
    }
    pollIntervalRef.current = setInterval(async () => {
      if (busyRef.current) return;
      try {
        const data = await fetchSessionOptions(sessionId);
        let didChange = false;
        setOptions(prev => {
          const prevSet = new Set(prev);
          const changed = prev.length !== data.options.length || data.options.some((o: string) => !prevSet.has(o));
          if (!changed) return prev;
          didChange = true;
          return data.options as string[];
        });
        if (didChange) {
          setExternalEdit(true);
          if (externalEditTimerRef.current) clearTimeout(externalEditTimerRef.current);
          externalEditTimerRef.current = setTimeout(() => setExternalEdit(false), 3000);
        }
      } catch { /* silent */ }
    }, 2500);
    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } };
  }, [step, sessionId]);

  useEffect(() => {
    loadSavedPolls();
    return () => { if (externalEditTimerRef.current) clearTimeout(externalEditTimerRef.current); };
  }, []);

  async function loadSavedPolls() {
    setSavedPollsLoading(true);
    try { setSavedPolls(await fetchSavedPolls()); } catch { /* silent */ } finally { setSavedPollsLoading(false); }
  }

  async function handleSaveName() {
    if (!sessionId || !nameInput.trim() || nameInput.trim() === sessionName) { setEditingName(false); return; }
    try { await updateSessionName(sessionId, nameInput.trim()); setSessionName(nameInput.trim()); }
    catch { setNameInput(sessionName); }
    setEditingName(false);
  }

  async function handleCreateCustom() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const name = customName.trim() || 'Без названия';
      if (sessionId) {
        if (customName.trim()) await updateSessionName(sessionId, name);
        setSessionName(name);
      } else {
        const { id } = await createSession(name);
        setSessionId(id); setSessionName(name);
      }
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      setError(msg.includes('409') ? 'В этой группе уже идёт сбор вариантов.' : msg);
    } finally { setBusy(false); }
  }

  async function handleAddOption() {
    if (!sessionId || !optionInput.trim() || busy) return;
    setBusy(true); setError('');
    try { const { options: updated } = await addOption(sessionId, optionInput.trim()); setOptions(updated); setOptionInput(''); }
    catch (err: unknown) { setError(String(err)); }
    finally { setBusy(false); }
  }

  async function loadOptionSet(name: string, pollOptions: string[], savedPollId: string | null) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      let id = sessionId;
      if (id) {
        for (const opt of options) await removeOption(id, opt);
        setOptions([]);
        await updateSessionName(id, name);
      } else {
        const res = await createSession(name);
        id = res.id; setSessionId(id);
      }
      setSessionName(name);
      const loaded: string[] = [];
      for (const opt of pollOptions) {
        const { options: updated } = await addOption(id, opt);
        loaded.push(...updated.filter(o => !loaded.includes(o)));
      }
      setOptions(loaded); setSavedId(savedPollId); setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      setError(msg.includes('409') ? 'В этой группе уже идёт сбор вариантов.' : msg);
    } finally { setBusy(false); }
  }

  function handlePreset(preset: Preset) { return loadOptionSet(preset.name, preset.options, null); }
  function handleSavedPoll(poll: SavedPoll) { return loadOptionSet(poll.name, poll.options, poll.id); }

  async function handleRemoveOption(text: string) {
    if (!sessionId || busy) return;
    setRemovingOption(text); setError('');
    try { const { options: updated } = await removeOption(sessionId, text); setOptions(updated); }
    catch (err: unknown) { setError(String(err)); }
    finally { setRemovingOption(null); }
  }

  async function handleStartVoting() {
    if (!sessionId || busy) return;
    setBusy(true); setError(''); setStep('starting');
    try { await startVoting(sessionId); onSessionReady(sessionId); }
    catch (err: unknown) { setError(String(err)); setStep('options'); }
    finally { setBusy(false); }
  }

  async function handleSaveTemplate() {
    if (saving || options.length < 2) return;
    setSaving(true); setSaveSuccess(false);
    try {
      if (savedId) {
        await updateSavedPoll(savedId, { name: sessionName, options, emoji: saveEmoji });
        setSavedPolls(prev => prev.map(p => p.id === savedId ? { ...p, name: sessionName, options, emoji: saveEmoji, updated_at: new Date().toISOString() } : p));
      } else {
        const { id } = await createSavedPoll(sessionName, options, saveEmoji);
        const newPoll: SavedPoll = { id, name: sessionName, options, emoji: saveEmoji, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        setSavedPolls(prev => [newPoll, ...prev]); setSavedId(id);
      }
      setShowSaveForm(false); setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) { setError(String(err)); }
    finally { setSaving(false); }
  }

  async function handleDeleteSavedPoll(id: string) {
    setDeletingId(id);
    try { await deleteSavedPoll(id); setSavedPolls(prev => prev.filter(p => p.id !== id)); if (savedId === id) setSavedId(null); }
    catch (err: unknown) { setError(String(err)); }
    finally { setDeletingId(null); }
  }

  // ── Router ────────────────────────────────────────────────────────

  if (step === 'home') return (
    <HomeStep
      customName={customName} setCustomName={setCustomName}
      error={error} busy={busy}
      savedPolls={savedPolls} savedPollsLoading={savedPollsLoading}
      onNavigateMyPolls={() => { setError(''); setStep('my-polls'); }}
      onNavigatePresets={() => { setError(''); setStep('presets'); }}
      onCreate={handleCreateCustom}
    />
  );

  if (step === 'presets') return (
    <PresetsStep
      busy={busy} error={error}
      onBack={() => { setError(''); setStep('home'); }}
      onSelect={handlePreset}
    />
  );

  if (step === 'my-polls') return (
    <MyPollsStep
      busy={busy} error={error}
      savedPolls={savedPolls} deletingId={deletingId}
      onBack={() => { setError(''); setStep('home'); }}
      onSelect={handleSavedPoll}
      onDelete={handleDeleteSavedPoll}
      onCreateNew={() => setStep('home')}
    />
  );

  if (step === 'options') return (
    <OptionsStep
      sessionName={sessionName} options={options}
      optionInput={optionInput} setOptionInput={setOptionInput}
      error={error} busy={busy} removingOption={removingOption}
      editingName={editingName} setEditingName={setEditingName}
      nameInput={nameInput} setNameInput={setNameInput}
      externalEdit={externalEdit} savedId={savedId}
      showSaveForm={showSaveForm} setShowSaveForm={setShowSaveForm}
      saveEmoji={saveEmoji} setSaveEmoji={setSaveEmoji}
      saving={saving} saveSuccess={saveSuccess}
      onBack={() => { setError(''); setStep('home'); }}
      onAddOption={handleAddOption}
      onRemoveOption={handleRemoveOption}
      onStartVoting={handleStartVoting}
      onSaveTemplate={handleSaveTemplate}
      onSaveName={handleSaveName}
    />
  );

  // ── Starting ───────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 12, padding: '0 24px', textAlign: 'center' }}>
      {startingTimedOut ? (
        <>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Что-то пошло не так</div>
          <div style={{ fontSize: 14, color: 'var(--text-hint)', lineHeight: 1.5 }}>
            Не удалось отправить сообщение в группу. Попробуй ещё раз.
          </div>
          <button
            onClick={() => { setStep('options'); setBusy(false); setError(''); }}
            style={{ marginTop: 8, padding: '12px 24px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >Назад к вариантам</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 32 }}>📢</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Открываем голосование в группе…</div>
        </>
      )}
    </div>
  );
}

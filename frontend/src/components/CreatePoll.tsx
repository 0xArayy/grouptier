import { useState, useEffect, useRef } from 'react';
import {
  ApiError,
  createSession,
  addOption,
  removeOption,
  bulkReplaceOptions,
  startVoting,
  updateSessionName,
  fetchSessionOptions,
  fetchSavedPolls,
  createSavedPoll,
  updateSavedPoll,
  deleteSavedPoll,
  type SavedPoll,
} from '../api/client.ts';
import appStyles from '../App.module.css';
import { HomeStep } from './create-poll/HomeStep.tsx';
import { PresetsStep, type Preset } from './create-poll/PresetsStep.tsx';
import { MyPollsStep } from './create-poll/MyPollsStep.tsx';
import { OptionsStep } from './create-poll/OptionsStep.tsx';
import { AiSuggestStep } from './create-poll/AiSuggestStep.tsx';
import { DEFAULT_SAVE_EMOJI } from '../lib/constants.ts';

interface Props {
  onSessionReady: (sessionId: string) => void;
  onShareReady?: (sessionId: string, shareUrl: string) => void;
  existingSession?: { id: string; name: string; options: string[]; shareUrl?: string };
}

type Step = 'home' | 'presets' | 'my-polls' | 'options' | 'starting' | 'ai-suggest';


export function CreatePoll({ onSessionReady, onShareReady, existingSession }: Props) {
  const [step, setStep] = useState<Step>('home');
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

  const [shareUrl, setShareUrl] = useState<string | null>(existingSession?.shareUrl ?? null);

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
  const [aiExistingOptions, setAiExistingOptions] = useState<string[]>([]);

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
        const { id, share_url } = await createSession(name);
        setSessionId(id); setSessionName(name); setShareUrl(share_url);
      }
      setStep('options');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.id === 'string') {
        setSessionId(err.body.id);
        setSessionName(customName.trim() || 'Без названия');
        if (typeof err.body.share_url === 'string') setShareUrl(err.body.share_url);
        setStep('options');
      } else {
        setError(err instanceof ApiError ? err.message : String(err));
      }
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
    if (busyRef.current) return;
    busyRef.current = true; // synchronous guard — prevents polling race before setBusy re-renders
    setBusy(true); setError('');
    const prevStep = step;
    setStep('options');
    setSessionName(name);
    try {
      let id = sessionId;
      if (!id) {
        const res = await createSession(name);
        id = res.id; setSessionId(id); setShareUrl(res.share_url);
      }
      // Single atomic PUT: deletes all existing options and inserts new ones in one transaction.
      // Also updates the session name when replacing into an existing session.
      const { options: loaded } = await bulkReplaceOptions(id!, pollOptions, sessionId ? name : undefined);
      setOptions(loaded); setSavedId(savedPollId);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.id === 'string') {
        setSessionId(err.body.id);
        setSessionName(name);
        if (typeof err.body.share_url === 'string') setShareUrl(err.body.share_url);
        setStep('options');
      } else {
        setStep(prevStep);
        setError(err instanceof ApiError ? err.message : String(err));
      }
    } finally { busyRef.current = false; setBusy(false); }
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

  async function handleAiConfirmBlankCanvas(selected: string[]) {
    setBusy(true); setError('');
    try {
      const name = customName.trim() || 'Без названия';
      let id: string;
      let share_url: string;
      try {
        const res = await createSession(name);
        id = res.id; share_url = res.share_url;
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409 && typeof err.body.id === 'string') {
          id = err.body.id;
          share_url = typeof err.body.share_url === 'string' ? err.body.share_url : '';
        } else { throw err; }
      }
      setSessionId(id); setSessionName(name); setShareUrl(share_url);
      const { options: loaded } = await bulkReplaceOptions(id, selected);
      setOptions(loaded);
      setStep('options');
    } finally { setBusy(false); }
  }

  async function handleAiConfirmFillTheRest(selected: string[]) {
    if (!sessionId) return;
    if (options.length + selected.length > 32) {
      throw new Error('Слишком много вариантов — убери лишние перед добавлением');
    }
    setBusy(true); setError('');
    try {
      let current = options;
      for (const opt of selected) {
        const { options: updated } = await addOption(sessionId, opt);
        current = updated;
      }
      setOptions(current);
      setStep('options');
    } finally { setBusy(false); }
  }

  async function handleStartVoting() {
    if (!sessionId || busy) return;
    setBusy(true); setError(''); setStep('starting');
    try {
      const result = await startVoting(sessionId);
      if (result.share_url && onShareReady) {
        onShareReady(sessionId, result.share_url);
      } else {
        onSessionReady(sessionId);
      }
    }
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
      onGenerateWithAi={() => { setError(''); setAiExistingOptions([]); setStep('ai-suggest'); }}
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
      shareUrl={shareUrl}
      onBack={() => { setError(''); setSessionId(null); setOptions([]); setStep('home'); }}
      onAddOption={handleAddOption}
      onRemoveOption={handleRemoveOption}
      onStartVoting={handleStartVoting}
      onSaveTemplate={handleSaveTemplate}
      onSaveName={handleSaveName}
      onGenerateWithAi={() => { setError(''); setAiExistingOptions([...options]); setStep('ai-suggest'); }}
    />
  );

  if (step === 'ai-suggest') return (
    <AiSuggestStep
      sessionName={customName.trim() || sessionName || 'Без названия'}
      existingOptions={aiExistingOptions}
      onBack={() => {
        setError('');
        setStep(aiExistingOptions.length > 0 ? 'options' : 'home');
      }}
      onConfirm={aiExistingOptions.length > 0 ? handleAiConfirmFillTheRest : handleAiConfirmBlankCanvas}
    />
  );

  // ── Starting ───────────────────────────────────────────────────────
  return (
    <div className={appStyles.startingScreen}>
      {startingTimedOut ? (
        <>
          <div className={appStyles.timeoutEmoji}>⚠️</div>
          <div className={appStyles.timeoutTitle}>Что-то пошло не так</div>
          <div className={appStyles.timeoutText}>
            Не удалось отправить сообщение в группу. Попробуй ещё раз.
          </div>
          <button
            onClick={() => { setStartingTimedOut(false); setBusy(false); setStep('options'); setError(''); }}
            className={appStyles.timeoutBtn}
          >Вернуться к вариантам</button>
        </>
      ) : (
        <>
          <div className={appStyles.startingSpinner} />
          <div className={appStyles.startingText}>Открываем голосование в группе…</div>
        </>
      )}
    </div>
  );
}

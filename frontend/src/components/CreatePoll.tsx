import { useState } from 'react';
import { createSession, addOption, startVoting, updateSessionName } from '../api/client.ts';

interface Props {
  onSessionReady: (sessionId: string) => void;
  existingSession?: { id: string; name: string; options: string[] };
}

type Step = 'name' | 'options' | 'starting';

const PRESETS: { emoji: string; label: string; name: string; options: string[] }[] = [
  {
    emoji: '🍕',
    label: 'Food',
    name: 'What should we eat?',
    options: ['Pizza', 'Sushi', 'Burgers', 'Tacos', 'Ramen', 'Pasta', 'Thai', 'Salad'],
  },
  {
    emoji: '🎮',
    label: 'Games',
    name: 'What should we play?',
    options: ['Minecraft', 'Valorant', 'CS2', 'Among Us', 'Stardew Valley', 'Rocket League', 'Fortnite', 'League of Legends'],
  },
  {
    emoji: '🎬',
    label: 'Movies',
    name: 'What genre tonight?',
    options: ['Action', 'Comedy', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Animation', 'Documentary'],
  },
];

export function CreatePoll({ onSessionReady, existingSession }: Props) {
  const [step, setStep] = useState<Step>(existingSession ? 'options' : 'name');
  const [sessionId, setSessionId] = useState<string | null>(existingSession?.id ?? null);
  const [sessionName, setSessionName] = useState(existingSession?.name ?? '');
  const [options, setOptions] = useState<string[]>(existingSession?.options ?? []);
  const [optionInput, setOptionInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(existingSession?.name ?? '');

  async function handleSaveName() {
    if (!sessionId || !nameInput.trim() || nameInput.trim() === sessionName) {
      setEditingName(false);
      return;
    }
    try {
      await updateSessionName(sessionId, nameInput.trim());
      setSessionName(nameInput.trim());
    } catch {
      setNameInput(sessionName); // revert on error
    }
    setEditingName(false);
  }

  async function handleCreateSession() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { id } = await createSession(sessionName.trim() || 'Untitled Poll');
      setSessionId(id);
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('409')) {
        setError('A session is already collecting in this group.');
      } else {
        setError(msg);
      }
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
      const { id } = await createSession(preset.name);
      setSessionId(id);
      setSessionName(preset.name);
      const loaded: string[] = [];
      for (const opt of preset.options) {
        const { options: updated } = await addOption(id, opt);
        loaded.push(...updated.filter(o => !loaded.includes(o)));
      }
      setOptions(loaded);
      setStep('options');
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('409')) {
        setError('A session is already collecting in this group.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
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

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
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

  if (step === 'name') {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Create a Poll</div>
        <div style={{ fontSize: 14, color: 'var(--text-hint)', marginBottom: 20 }}>
          Name your poll — then add the options your group will rank.
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Quick start
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              disabled={busy}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--surface)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Custom
        </div>
        <input
          style={inputStyle}
          placeholder="Poll name (e.g. Best pizza topping)"
          value={sessionName}
          onChange={e => setSessionName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateSession()}
          autoFocus
        />
        {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ marginTop: 12 }}>
          <button style={buttonStyle} disabled={busy} onClick={handleCreateSession}>
            {busy ? 'Creating…' : 'Next →'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'options') {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
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
            {sessionName || 'Untitled Poll'}
            <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 400 }}>✏️</span>
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: 20 }}>
          Add 2–12 options, then start voting.
        </div>

        {options.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {options.map((opt, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                marginBottom: 6,
                fontSize: 14,
              }}>
                {i + 1}. {opt}
              </div>
            ))}
          </div>
        )}

        {options.length < 12 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Add an option…"
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
          style={{ ...buttonStyle, opacity: (options.length < 2 || busy) ? 0.5 : 1 }}
          disabled={options.length < 2 || busy}
          onClick={handleStartVoting}
        >
          Start Voting ({options.length} option{options.length !== 1 ? 's' : ''})
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>📢</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Opening vote in your group…</div>
    </div>
  );
}

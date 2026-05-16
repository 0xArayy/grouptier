import { useState } from 'react';
import { createSession, addOption, startVoting } from '../api/client.ts';

interface Props {
  onSessionReady: (sessionId: string) => void;
}

type Step = 'name' | 'options' | 'starting';

export function CreatePoll({ onSessionReady }: Props) {
  const [step, setStep] = useState<Step>('name');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    borderRadius: 12,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
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
        <div style={{ fontSize: 14, color: 'var(--text-hint)', marginBottom: 24 }}>
          Name your poll — then add the options your group will rank.
        </div>

        <input
          style={inputStyle}
          placeholder="Poll name (e.g. Best pizza topping)"
          value={sessionName}
          onChange={e => setSessionName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateSession()}
          autoFocus
        />
        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
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
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{sessionName || 'Your Poll'}</div>
        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: 20 }}>
          Add 2–12 options, then start voting.
        </div>

        {options.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {options.map((opt, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                borderRadius: 8,
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
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: (!optionInput.trim() || busy) ? 'not-allowed' : 'pointer',
                opacity: (!optionInput.trim() || busy) ? 0.5 : 1,
              }}
            >
              +
            </button>
          </div>
        )}

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 10 }}>{error}</div>}

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

import { useState, useEffect } from 'react';
import { generateAiOptions } from '../../api/client.ts';

interface Props {
  sessionName: string;
  existingOptions: string[];
  onBack: () => void;
  onConfirm: (selected: string[]) => Promise<void>;
}

export function AiSuggestStep({ sessionName, existingOptions, onBack, onConfirm }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    generateAiOptions(sessionName, existingOptions.length ? existingOptions : undefined)
      .then(({ options }) => {
        if (cancelled) return;
        setSuggestions(options);
        setSelected(new Set(options));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function toggle(opt: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0 || confirming) return;
    setConfirming(true);
    setError('');
    try {
      await onConfirm([...selected]);
    } catch (err: unknown) {
      setError(String(err));
      setConfirming(false);
    }
  }

  function handleRetry() {
    setLoading(true);
    setError('');
    generateAiOptions(sessionName, existingOptions.length ? existingOptions : undefined)
      .then(({ options }) => { setSuggestions(options); setSelected(new Set(options)); })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
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
    cursor: (selected.size === 0 || confirming) ? 'not-allowed' : 'pointer',
    opacity: (selected.size === 0 || confirming) ? 0.5 : 1,
    boxShadow: '0 2px 8px var(--accent-shadow)',
    minHeight: 'var(--tap-target-min)',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <button
          onClick={onBack}
          disabled={confirming}
          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 20, cursor: confirming ? 'not-allowed' : 'pointer', padding: '0 4px', lineHeight: 1 }}
        >←</button>
      </div>

      <div style={{ padding: '12px 16px 24px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>✨ Варианты для ИИ</div>
        <div style={{ fontSize: 13, color: 'var(--text-hint)', marginBottom: 20 }}>
          {sessionName} — выбери что добавить, убери лишнее.
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--surface)', borderTopColor: 'var(--accent)', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ fontSize: 14, color: 'var(--text-hint)' }}>Генерируем варианты…</div>
          </div>
        )}

        {!loading && error && !suggestions.length && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 16 }}>{error}</div>
            <button
              onClick={handleRetry}
              style={{ padding: '11px 24px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
            >Попробовать ещё раз</button>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {suggestions.map(opt => {
                const isSelected = selected.has(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    disabled={confirming}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--surface)',
                      background: 'var(--surface)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-hint)',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      cursor: confirming ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      opacity: isSelected ? 1 : 0.45,
                      lineHeight: 1.35,
                      minHeight: 'var(--tap-target-min)',
                    }}
                  >{opt}</button>
                );
              })}
            </div>

            {error && (
              <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}

            <button style={primaryBtn} onClick={handleConfirm} disabled={selected.size === 0 || confirming}>
              {confirming ? 'Добавляем…' : `Добавить выбранные (${selected.size})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

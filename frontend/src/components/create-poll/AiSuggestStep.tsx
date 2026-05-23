import { useState, useEffect } from 'react';
import { generateAiOptions } from '../../api/client.ts';
import styles from './AiSuggestStep.module.css';

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

  return (
    <div className={styles.container}>
      <div className={styles.navRow}>
        <button
          onClick={onBack}
          disabled={confirming}
          className={styles.backBtn}
        >←</button>
      </div>

      <div className={styles.content}>
        <div className={styles.title}>✨ Варианты для ИИ</div>
        <div className={styles.subtitle}>
          {sessionName} — выбери что добавить, убери лишнее.
        </div>

        {loading && (
          <div className={styles.loadingBox}>
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingText}>Генерируем варианты…</div>
          </div>
        )}

        {!loading && error && !suggestions.length && (
          <div className={styles.errorBox}>
            <div className={styles.errorText}>{error}</div>
            <button onClick={handleRetry} className={styles.retryBtn}>
              Попробовать ещё раз
            </button>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <>
            <div className={styles.grid}>
              {suggestions.map(opt => {
                const isSelected = selected.has(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    disabled={confirming}
                    className={`${styles.chip}${isSelected ? ` ${styles.chipSelected}` : ''}`}
                  >{opt}</button>
                );
              })}
            </div>

            {error && <div className={styles.inlineError}>{error}</div>}

            <button
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={selected.size === 0 || confirming}
            >
              {confirming ? 'Добавляем…' : `Добавить выбранные (${selected.size})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

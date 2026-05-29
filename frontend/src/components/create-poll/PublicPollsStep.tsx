import { useCallback, useEffect, useRef, useState } from 'react';
import { type PublicPoll, searchPublicPolls } from '../../api/client.ts';
import styles from './PublicPollsStep.module.css';

interface Props {
  busy: boolean;
  onBack: () => void;
  onUse: (poll: PublicPoll) => void;
}

export function PublicPollsStep({ busy, onBack, onUse }: Props) {
  const [q, setQ] = useState('');
  const [polls, setPolls] = useState<PublicPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError('');
    searchPublicPolls(query || undefined)
      .then(({ items }) => setPolls(items))
      .catch(() => setError('Ошибка загрузки. Попробуй ещё раз.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  function handleSearch(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value), 350);
  }

  return (
    <div className={styles.container}>
      <div className={styles.stickyHeader}>
        <button type="button" onClick={onBack} className={styles.backBtn}>
          ←
        </button>
        <div className={styles.headerTitle}>Публичные опросы</div>
      </div>

      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          placeholder="Поиск по названию…"
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.list}>
        {loading ? (
          <div className={styles.loadingText}>Загружаем…</div>
        ) : !error && polls.length === 0 ? (
          <div className={styles.emptyState}>
            {q ? 'Ничего не найдено.' : 'Пока нет публичных опросов.'}
            {!q && (
              <>
                <br />
                <span className={styles.emptyHint}>Опубликуй свой шаблон в «Мои опросы»!</span>
              </>
            )}
          </div>
        ) : (
          polls.map((poll) => (
            <div key={poll.id} className={styles.pollCard}>
              <span className={styles.pollEmoji}>{poll.emoji}</span>
              <div className={styles.pollBody}>
                <div className={styles.pollName}>{poll.name}</div>
                <div className={styles.pollMeta}>
                  {poll.author_name && <span className={styles.metaChip}>👤 {poll.author_name}</span>}
                  <span className={styles.metaChip}>{poll.option_count} вар.</span>
                  {poll.uses_count > 0 && <span className={styles.metaChip}>▶ {poll.uses_count}</span>}
                </div>
              </div>
              <button type="button" className={styles.useBtn} disabled={busy} onClick={() => onUse(poll)}>
                Взять
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

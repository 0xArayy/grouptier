import { useEffect, useMemo, useState } from 'react';
import { fetchTemplates, recordTemplateUse, type PublicTemplate } from '../../api/client.ts';
import styles from './PresetsStep.module.css';

// Keep Preset compatible with CreatePoll's handlePreset(preset.name, preset.options)
export type Preset = Pick<PublicTemplate, 'emoji' | 'name' | 'options'>;

type Category = 'all' | 'hot' | 'official' | PublicTemplate['category'];

const CATEGORIES: { id: Category; label: string; variant?: 'hot' | 'official' }[] = [
  { id: 'all', label: '🔥 Все' },
  { id: 'hot', label: 'HOT', variant: 'hot' },
  { id: 'official', label: 'OFFICIAL', variant: 'official' },
  { id: 'games', label: '🎮 Игры' },
  { id: 'food', label: '🍕 Еда' },
  { id: 'movies', label: '🎬 Кино' },
  { id: 'series', label: '📺 Сериалы' },
  { id: 'music', label: '🎵 Музыка' },
  { id: 'sport', label: '🏆 Спорт' },
];

function formatUses(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

interface Props {
  busy: boolean;
  error: string;
  onBack: () => void;
  onSelect: (preset: Preset) => void;
}

export function PresetsStep({ busy, error, onBack, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchTemplates(controller.signal)
      .then(data => { setTemplates(data); setFetchError(''); })
      .catch(err => { if (err.name !== 'AbortError') setFetchError('Не удалось загрузить шаблоны.'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter(t => {
      if (category === 'hot' && !t.hot) return false;
      if (category === 'official' && !t.official) return false;
      if (category !== 'all' && category !== 'hot' && category !== 'official' && t.category !== category) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.options.some(o => o.toLowerCase().includes(q));
    });
  }, [query, category, templates]);

  function handleSelect(t: PublicTemplate) {
    recordTemplateUse(t.id); // fire-and-forget, never blocks
    onSelect({ emoji: t.emoji, name: t.name, options: t.options });
  }

  return (
    <div className={styles.container}>
      {/* Sticky header */}
      <div className={styles.stickyHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <div>
          <div className={styles.headerTitle}>Выбери шаблон</div>
          <div className={styles.headerSub}>Готовые темы от сообщества и команды GroupTier.</div>
        </div>
      </div>

      <div className={styles.body}>
        {/* Search */}
        <div className={styles.searchBox}>
          {query ? (
            <button className={styles.searchClear} onClick={() => setQuery('')}>✕</button>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.searchIcon}>
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
          )}
          <input
            className={styles.searchInput}
            placeholder="Поиск по шаблонам"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <span className={styles.searchHint}>↵</span>
        </div>

        {/* Category chips */}
        <div className={styles.categories}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              className={[
                styles.catChip,
                category === c.id ? styles.catChipActive : '',
                c.variant === 'hot' ? styles.catChipHot : '',
                c.variant === 'official' ? styles.catChipOfficial : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {(error || fetchError) && (
          <div className={styles.errorText}>
            {error || fetchError}
            {fetchError && (
              <button className={styles.retryBtn} onClick={() => {
                setLoading(true); setFetchError('');
                fetchTemplates()
                  .then(data => { setTemplates(data); })
                  .catch(() => setFetchError('Не удалось загрузить шаблоны.'))
                  .finally(() => setLoading(false));
              }}>Повторить →</button>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className={styles.list}>
            {[0, 1, 2].map(i => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        )}

        {/* Template list */}
        {!loading && filtered.length === 0 && !fetchError && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <div className={styles.emptyText}>
              {query ? `Нет шаблонов по запросу «${query}»` : 'Нет шаблонов в этой категории'}
            </div>
            <button
              className={styles.dashedBtn}
              onClick={() => onSelect({ emoji: '🎯', name: query || 'Свой шаблон', options: [] })}
            >
              <span>+</span> Создать пустой шаблон
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className={styles.list}>
            {filtered.map(t => {
              const visibleOptions = t.options.slice(0, 6);
              const overflow = t.options.length - 6;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  disabled={busy}
                  className={styles.card}
                >
                  <div className={styles.cardEmoji}>{t.emoji}</div>

                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{t.name}</span>
                      {t.hot && <span className={styles.badgeHot}>HOT</span>}
                      {t.official && <span className={styles.badgeOfficial}>OFFICIAL</span>}
                    </div>

                    <div className={styles.cardMeta}>
                      {t.official ? 'GroupTier' : t.author} · {formatUses(t.uses_7d)} использовали
                    </div>

                    <div className={styles.cardChips}>
                      {visibleOptions.map(opt => (
                        <span key={opt} className={styles.chip}>{opt}</span>
                      ))}
                      {overflow > 0 && (
                        <span className={`${styles.chip} ${styles.chipOverflow}`}>+{overflow}</span>
                      )}
                    </div>
                  </div>

                  <span className={styles.cardArrow}>›</span>
                </button>
              );
            })}

            <button
              className={styles.dashedBtn}
              onClick={() => onSelect({ emoji: '🎯', name: 'Свой шаблон', options: [] })}
              disabled={busy}
            >
              <span>+</span> Создать пустой шаблон
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

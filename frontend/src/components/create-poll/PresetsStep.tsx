import { useEffect, useMemo, useState } from 'react';
import {
  fetchTemplates, searchPublicPolls, recordTemplateUse,
  type PublicTemplate, type PublicPoll,
} from '../../api/client.ts';
import styles from './PresetsStep.module.css';

export type Preset = Pick<PublicTemplate, 'emoji' | 'name' | 'options'>;

export type SelectResult =
  | { kind: 'template'; preset: Preset }
  | { kind: 'poll'; id: string };

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

type ListItem =
  | { kind: 'template'; data: PublicTemplate }
  | { kind: 'poll'; data: PublicPoll };

function formatUses(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
  return String(n);
}

interface Props {
  busy: boolean;
  error: string;
  onBack: () => void;
  onSelect: (result: SelectResult) => void;
}

export function PresetsStep({ busy, error, onBack, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [polls, setPolls] = useState<PublicPoll[]>([]);
  const [pollsNextOffset, setPollsNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState('');

  function load(signal?: AbortSignal) {
    setLoading(true); setFetchError('');
    Promise.all([fetchTemplates(signal), searchPublicPolls()])
      .then(([tmpl, { items, nextOffset }]) => {
        setTemplates(tmpl);
        setPolls(items);
        setPollsNextOffset(nextOffset);
      })
      .catch(err => { if ((err as Error).name !== 'AbortError') setFetchError('Не удалось загрузить шаблоны.'); })
      .finally(() => setLoading(false));
  }

  function loadMore() {
    if (pollsNextOffset === null || loadingMore) return;
    setLoadingMore(true);
    searchPublicPolls(undefined, pollsNextOffset)
      .then(({ items, nextOffset }) => {
        setPolls(prev => [...prev, ...items]);
        setPollsNextOffset(nextOffset);
      })
      .catch(() => { /* silent — user can retry by scrolling */ })
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const filtered = useMemo((): ListItem[] => {
    const q = query.trim().toLowerCase();

    const tmpl = templates.filter(t => {
      if (category === 'hot' && !t.hot) return false;
      if (category === 'official' && !t.official) return false;
      if (category !== 'all' && category !== 'hot' && category !== 'official' && t.category !== category) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.options.some(o => o.toLowerCase().includes(q));
    });

    // user-published polls: not shown for hot/official filters
    const userPolls = (category === 'hot' || category === 'official') ? [] : polls.filter(p => {
      const catMatch = category === 'all' || p.categories.includes(category as string);
      if (!catMatch) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });

    return [
      ...tmpl.map(t => ({ kind: 'template' as const, data: t })),
      ...userPolls.map(p => ({ kind: 'poll' as const, data: p })),
    ];
  }, [query, category, templates, polls]);

  function handleSelectTemplate(t: PublicTemplate) {
    recordTemplateUse(t.id);
    onSelect({ kind: 'template', preset: { emoji: t.emoji, name: t.name, options: t.options } });
  }

  return (
    <div className={styles.container}>
      <div className={styles.stickyHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <div>
          <div className={styles.headerTitle}>Выбери шаблон</div>
          <div className={styles.headerSub}>Готовые темы от сообщества и команды GroupTier.</div>
        </div>
      </div>

      <div className={styles.body}>
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
              <button className={styles.retryBtn} onClick={() => load()}>Повторить →</button>
            )}
          </div>
        )}

        {loading && (
          <div className={styles.list}>
            {[0, 1, 2].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        )}

        {!loading && filtered.length === 0 && !fetchError && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <div className={styles.emptyText}>
              {query ? `Нет шаблонов по запросу «${query}»` : 'Нет шаблонов в этой категории'}
            </div>
            <button
              className={styles.dashedBtn}
              onClick={() => onSelect({ kind: 'template', preset: { emoji: '🎯', name: query || 'Свой шаблон', options: [] } })}
            >
              <span>+</span> Создать пустой шаблон
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className={styles.list}>
            {filtered.map(item => {
              if (item.kind === 'template') {
                const t = item.data;
                const visibleOptions = t.options.slice(0, 6);
                const overflow = t.options.length - 6;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
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
                        GroupTier · {formatUses(t.uses_7d)} использовали
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
              }

              // user-published poll
              const p = item.data;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect({ kind: 'poll', id: p.id })}
                  disabled={busy}
                  className={styles.card}
                >
                  <div className={styles.cardEmoji}>{p.emoji}</div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{p.name}</span>
                    </div>
                    <div className={styles.cardMeta}>
                      {p.author_name ? `${p.author_name} · ` : ''}{p.option_count} вариантов
                      {p.uses_count > 0 && ` · ${formatUses(p.uses_count)} использовали`}
                    </div>
                    {p.categories.length > 0 && (
                      <div className={styles.cardChips}>
                        {p.categories.map(cat => {
                          const label = CATEGORIES.find(c => c.id === cat)?.label ?? cat;
                          return <span key={cat} className={styles.chip}>{label}</span>;
                        })}
                      </div>
                    )}
                  </div>
                  <span className={styles.cardArrow}>›</span>
                </button>
              );
            })}

            {pollsNextOffset !== null && (
              <button
                className={styles.loadMoreBtn}
                onClick={loadMore}
                disabled={loadingMore || busy}
              >
                {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
              </button>
            )}

            <button
              className={styles.dashedBtn}
              onClick={() => onSelect({ kind: 'template', preset: { emoji: '🎯', name: 'Свой шаблон', options: [] } })}
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

import { useMemo, useState } from 'react';
import styles from './PresetsStep.module.css';

interface Template {
  id: string;
  emoji: string;
  name: string;
  options: string[];
  author: string;
  official: boolean;
  hot: boolean;
  uses: number;
  category: 'games' | 'food' | 'movies' | 'series' | 'music' | 'sport' | 'other';
}

// Keep Preset compatible with CreatePoll's handlePreset(preset.name, preset.options)
export type Preset = Pick<Template, 'emoji' | 'name' | 'options'>;

const TEMPLATES: Template[] = [
  { id: '1', emoji: '🍕', name: 'Что будем есть?', options: ['Пицца', 'Суши', 'Бургеры', 'Тако', 'Рамен', 'Паста', 'Тайская', 'Салат'], author: 'GroupTier', official: true, hot: true, uses: 4800, category: 'food' },
  { id: '2', emoji: '🎮', name: 'Во что сыграем?', options: ['Minecraft', 'Valorant', 'CS2', 'Among Us', 'Stardew Valley', 'Rocket League', 'Fortnite', 'League of Legends'], author: 'GroupTier', official: true, hot: true, uses: 3200, category: 'games' },
  { id: '3', emoji: '🎬', name: 'Какой жанр сегодня?', options: ['Боевик', 'Комедия', 'Ужасы', 'Романтика', 'Фантастика', 'Триллер', 'Анимация', 'Документалка'], author: 'GroupTier', official: true, hot: false, uses: 2100, category: 'movies' },
  { id: '4', emoji: '📺', name: 'Какой сериал смотрим?', options: ['Breaking Bad', 'Game of Thrones', 'The Bear', 'Severance', 'Succession', 'The Wire', 'Chernobyl', 'Dark'], author: '@alex', official: false, hot: true, uses: 1200, category: 'series' },
  { id: '5', emoji: '🎵', name: 'Какую музыку ставим?', options: ['Хип-хоп', 'Поп', 'Рок', 'Электронная', 'Джаз', 'R&B', 'Классика', 'Инди'], author: 'GroupTier', official: true, hot: false, uses: 890, category: 'music' },
  { id: '6', emoji: '🏖️', name: 'Куда едем?', options: ['Море', 'Горы', 'Город', 'Дача', 'Кемпинг', 'Экскурсии', 'Спа', 'Остаёмся дома'], author: '@marina', official: false, hot: false, uses: 540, category: 'other' },
  { id: '7', emoji: '🎯', name: 'Чем займёмся?', options: ['Боулинг', 'Кино', 'Бар', 'Парк', 'Квест', 'Настолки', 'Каток', 'Кафе'], author: '@dmitry', official: false, hot: false, uses: 310, category: 'other' },
  { id: '8', emoji: '🍺', name: 'Что пьём?', options: ['Пиво', 'Вино', 'Коктейли', 'Виски', 'Текила', 'Просекко', 'Безалкогольное', 'Чай'], author: '@sasha', official: false, hot: false, uses: 220, category: 'other' },
  { id: '9', emoji: '⚽', name: 'Лучшие матчи сезона', options: ['Финал ЛЧ', 'Класико', 'Дерби Мерсисайда', 'Манчестерское дерби', 'Дерби делла Мадонина'], author: '@sport_fan', official: false, hot: true, uses: 760, category: 'sport' },
];

type Category = 'all' | Template['category'];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: '🔥 Все' },
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter(t => {
      const matchCat = category === 'all' || t.category === category;
      if (!matchCat) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.options.some(o => o.toLowerCase().includes(q));
    });
  }, [query, category]);

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
              className={`${styles.catChip}${category === c.id ? ` ${styles.catChipActive}` : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error && <div className={styles.errorText}>{error}</div>}

        {/* Template list */}
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <div className={styles.emptyText}>Нет шаблонов по запросу «{query}»</div>
            <button
              className={styles.dashedBtn}
              onClick={() => onSelect({ emoji: '🎯', name: query || 'Свой шаблон', options: [] })}
            >
              <span>+</span> Создать пустой шаблон
            </button>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map(t => {
              const visibleOptions = t.options.slice(0, 6);
              const overflow = t.options.length - 6;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect({ emoji: t.emoji, name: t.name, options: t.options })}
                  disabled={busy}
                  className={styles.card}
                >
                  {/* Emoji avatar */}
                  <div className={styles.cardEmoji}>{t.emoji}</div>

                  <div className={styles.cardBody}>
                    {/* Title + badges */}
                    <div className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{t.name}</span>
                      {t.hot && <span className={styles.badgeHot}>HOT</span>}
                      {t.official && <span className={styles.badgeOfficial}>OFFICIAL</span>}
                    </div>

                    {/* Author + uses */}
                    <div className={styles.cardMeta}>
                      {t.official ? 'GroupTier' : t.author} · {formatUses(t.uses)} использовали
                    </div>

                    {/* Item chips */}
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

            {/* Fallback dashed button */}
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

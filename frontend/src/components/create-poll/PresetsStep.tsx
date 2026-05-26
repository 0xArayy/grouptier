import styles from './PresetsStep.module.css';

const PRESETS: { emoji: string; label: string; name: string; options: string[] }[] = [
  { emoji: '🍕', label: 'Еда', name: 'Что будем есть?', options: ['Пицца', 'Суши', 'Бургеры', 'Тако', 'Рамен', 'Паста', 'Тайская', 'Салат'] },
  { emoji: '🎮', label: 'Игры', name: 'Во что сыграем?', options: ['Minecraft', 'Valorant', 'CS2', 'Among Us', 'Stardew Valley', 'Rocket League', 'Fortnite', 'League of Legends'] },
  { emoji: '🎬', label: 'Кино', name: 'Какой жанр сегодня?', options: ['Боевик', 'Комедия', 'Ужасы', 'Романтика', 'Фантастика', 'Триллер', 'Анимация', 'Документалка'] },
  { emoji: '📺', label: 'Сериал', name: 'Какой сериал смотрим?', options: ['Breaking Bad', 'Game of Thrones', 'The Bear', 'Severance', 'Succession', 'The Wire', 'Chernobyl', 'Dark'] },
  { emoji: '🎵', label: 'Музыка', name: 'Какую музыку ставим?', options: ['Хип-хоп', 'Поп', 'Рок', 'Электронная', 'Джаз', 'R&B', 'Классика', 'Инди'] },
  { emoji: '🏖️', label: 'Отдых', name: 'Куда едем?', options: ['Море', 'Горы', 'Город', 'Дача', 'Кемпинг', 'Экскурсии', 'Спа', 'Остаёмся дома'] },
  { emoji: '🎯', label: 'Досуг', name: 'Чем займёмся?', options: ['Боулинг', 'Кино', 'Бар', 'Парк', 'Квест', 'Настолки', 'Каток', 'Кафе'] },
  { emoji: '🍺', label: 'Напитки', name: 'Что пьём?', options: ['Пиво', 'Вино', 'Коктейли', 'Виски', 'Текила', 'Просекко', 'Безалкогольное', 'Чай'] },
];

export type Preset = typeof PRESETS[number];
export { PRESETS };

interface Props {
  busy: boolean;
  error: string;
  onBack: () => void;
  onSelect: (preset: Preset) => void;
}

export function PresetsStep({ busy, error, onBack, onSelect }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.stickyHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <div className={styles.headerTitle}>Выбери тему</div>
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.list}>
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onSelect(p)}
            disabled={busy}
            className={styles.pollCard}
          >
            <span className={styles.pollEmoji}>{p.emoji}</span>
            <div className={styles.pollBody}>
              <div className={styles.pollName}>{p.name}</div>
              <div className={styles.pollTags}>
                {p.options.slice(0, 6).map(opt => (
                  <span key={opt} className={styles.pollTag}>{opt}</span>
                ))}
              </div>
            </div>
            <span className={styles.pollArrow}>›</span>
          </button>
        ))}
      </div>

      {busy && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingEmoji}>⏳</div>
          <div className={styles.loadingText}>Загружаем варианты…</div>
        </div>
      )}
    </div>
  );
}

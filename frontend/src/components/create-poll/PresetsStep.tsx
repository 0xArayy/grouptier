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
  const pollCardStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '14px 12px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--surface)',
    background: 'var(--surface)',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    marginBottom: 10,
    textAlign: 'left',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)',
        padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--surface)',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
        >←</button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Выбери тему</div>
      </div>

      {error && <div style={{ padding: '10px 16px', color: 'var(--accent)', fontSize: 13 }}>{error}</div>}

      <div style={{ padding: '12px 16px 32px' }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => onSelect(p)} disabled={busy} style={pollCardStyle}>
            <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{p.emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{p.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {p.options.map(opt => (
                  <span key={opt} style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 'var(--radius-full)',
                    background: 'var(--bg)', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap',
                  }}>{opt}</span>
                ))}
              </div>
            </div>
            <span style={{ fontSize: 18, color: 'var(--text-hint)', flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }}>›</span>
          </button>
        ))}
      </div>

      {busy && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', gap: 12,
        }}>
          <div style={{ fontSize: 36 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Загружаем варианты…</div>
        </div>
      )}
    </div>
  );
}

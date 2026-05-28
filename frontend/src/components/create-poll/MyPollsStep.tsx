import { useState } from 'react';
import type { SavedPoll } from '../../api/client.ts';
import styles from './MyPollsStep.module.css';

const PUBLISH_CATEGORIES = [
  { id: 'games', label: '🎮 Игры' },
  { id: 'food', label: '🍕 Еда' },
  { id: 'movies', label: '🎬 Кино' },
  { id: 'series', label: '📺 Сериалы' },
  { id: 'music', label: '🎵 Музыка' },
  { id: 'sport', label: '🏆 Спорт' },
  { id: 'other', label: '💬 Другое' },
];

interface Props {
  busy: boolean;
  error: string;
  savedPolls: SavedPoll[];
  deletingId: string | null;
  publishingId: string | null;
  onBack: () => void;
  onSelect: (poll: SavedPoll) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string, showAuthor: boolean, categories: string[]) => void;
  onUnpublish: (id: string) => void;
  onCreateNew: () => void;
}

export function MyPollsStep({
  busy, error, savedPolls, deletingId, publishingId,
  onBack, onSelect, onDelete, onPublish, onUnpublish, onCreateNew,
}: Props) {
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [publishPollId, setPublishPollId] = useState<string | null>(null);
  const [publishStage, setPublishStage] = useState<'cats' | 'author'>('cats');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  function startPublish(id: string) {
    setPublishPollId(id);
    setPublishStage('cats');
    setSelectedCats([]);
  }

  function cancelPublish() {
    setPublishPollId(null);
    setSelectedCats([]);
  }

  function toggleCat(cat: string) {
    setSelectedCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : prev.length < 3 ? [...prev, cat] : prev,
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.stickyHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <div>
          <div className={styles.headerTitle}>Мои шаблоны</div>
          <div className={styles.headerSub}>Твои сохранённые темы для тир-листов.</div>
        </div>
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.list}>
        {savedPolls.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <div className={styles.emptyText}>
              Шаблонов пока нет.<br />
              <span className={styles.emptyHint}>Создай опрос и сохрани его как шаблон.</span>
            </div>
          </div>
        ) : (
          savedPolls.map(poll => {
            const visibleOptions = poll.options.slice(0, 4);
            const overflow = poll.options.length - 4;
            const isMenuOpen = openKebab === poll.id;
            const isDeleting = deletingId === poll.id;
            const isPublishing = publishingId === poll.id;
            const isPublic = poll.is_public;
            const isPublishOpen = publishPollId === poll.id;

            return (
              <div key={poll.id} className={styles.card}>
                <button
                  className={styles.kebab}
                  onClick={e => { e.stopPropagation(); setOpenKebab(isMenuOpen ? null : poll.id); }}
                  aria-label="Меню"
                >⋯</button>

                {isMenuOpen && (
                  <>
                    <div className={styles.kebabOverlay} onClick={() => setOpenKebab(null)} />
                    <div className={styles.kebabMenu}>
                      <button
                        className={`${styles.kebabItem} ${styles.kebabItemDelete}`}
                        disabled={isDeleting || busy}
                        onClick={() => { setOpenKebab(null); onDelete(poll.id); }}
                      >
                        Удалить
                      </button>
                    </div>
                  </>
                )}

                <button
                  className={styles.cardMain}
                  onClick={() => { if (!isMenuOpen) { setOpenKebab(null); onSelect(poll); } }}
                  disabled={busy || isDeleting}
                >
                  <div className={styles.cardEmoji}>{poll.emoji}</div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle}>
                      {poll.name}
                      {isPublic && <span className={styles.publicBadge}>🌍</span>}
                    </div>
                    <div className={styles.cardStatus}>
                      <span className={isPublic ? styles.dotPublic : styles.dotPrivate}>●</span>
                      {isPublic ? 'Публичный' : 'Приватный'}
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
                </button>

                <div className={styles.hairline} />

                <div className={isPublishOpen && publishStage === 'cats' ? styles.cardFooterExpanded : styles.cardFooter}>
                  {isPublic ? (
                    <>
                      <span className={styles.footerLabel}>Виден всем</span>
                      <button
                        className={styles.unpublishBtn}
                        disabled={isPublishing || busy}
                        onClick={() => onUnpublish(poll.id)}
                      >
                        {isPublishing ? '…' : '🌍 Снять'}
                      </button>
                    </>
                  ) : isPublishOpen && publishStage === 'cats' ? (
                    <>
                      <div className={styles.publishCatLabel}>Теги (необязательно, до 3):</div>
                      <div className={styles.publishCatChips}>
                        {PUBLISH_CATEGORIES.map(c => (
                          <button
                            key={c.id}
                            className={[
                              styles.publishCatChip,
                              selectedCats.includes(c.id) ? styles.publishCatChipActive : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => toggleCat(c.id)}
                            disabled={!selectedCats.includes(c.id) && selectedCats.length >= 3}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <div className={styles.publishCatActions}>
                        <button
                          className={styles.publishNextBtn}
                          onClick={() => setPublishStage('author')}
                        >
                          Далее →
                        </button>
                        <button className={styles.publishCancelBtn} onClick={cancelPublish}>✕</button>
                      </div>
                    </>
                  ) : isPublishOpen && publishStage === 'author' ? (
                    <>
                      <span className={styles.footerLabel}>Опубликовать как:</span>
                      <div className={styles.publishChoice}>
                        <button
                          className={styles.publishChoiceBtn}
                          disabled={isPublishing || busy}
                          onClick={() => { cancelPublish(); onPublish(poll.id, true, selectedCats); }}
                        >С именем</button>
                        <button
                          className={styles.publishChoiceBtn}
                          disabled={isPublishing || busy}
                          onClick={() => { cancelPublish(); onPublish(poll.id, false, selectedCats); }}
                        >Анонимно</button>
                        <button className={styles.publishCancelBtn} onClick={cancelPublish}>✕</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className={styles.footerLabel}>Видно только тебе</span>
                      <button
                        className={styles.publishBtn}
                        disabled={busy}
                        onClick={() => startPublish(poll.id)}
                      >
                        {isPublishing ? '…' : '🌐 Опубликовать'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        <button
          className={styles.dashedBtn}
          onClick={onCreateNew}
          disabled={busy}
        >
          <span>+</span> Создать новый шаблон
        </button>
      </div>
    </div>
  );
}

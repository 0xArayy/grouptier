import { useState } from 'react';
import type { SavedPoll } from '../../api/client.ts';
import styles from './MyPollsStep.module.css';

interface Props {
  busy: boolean;
  error: string;
  savedPolls: SavedPoll[];
  deletingId: string | null;
  publishingId: string | null;
  onBack: () => void;
  onSelect: (poll: SavedPoll) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string, showAuthor: boolean) => void;
  onUnpublish: (id: string) => void;
  onCreateNew: () => void;
}

export function MyPollsStep({
  busy, error, savedPolls, deletingId, publishingId,
  onBack, onSelect, onDelete, onPublish, onUnpublish, onCreateNew,
}: Props) {
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [expandedPublish, setExpandedPublish] = useState<string | null>(null);

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
            const isPublishExpanded = expandedPublish === poll.id;
            const isPublic = (poll as SavedPoll & { is_public?: boolean }).is_public;

            return (
              <div key={poll.id} className={styles.card}>
                {/* Kebab menu button */}
                <button
                  className={styles.kebab}
                  onClick={e => { e.stopPropagation(); setOpenKebab(isMenuOpen ? null : poll.id); }}
                  aria-label="Меню"
                >⋯</button>

                {/* Kebab dropdown */}
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

                {/* Main tap area */}
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

                {/* Hairline + footer */}
                <div className={styles.hairline} />
                <div className={styles.cardFooter}>
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
                  ) : isPublishExpanded ? (
                    <>
                      <span className={styles.footerLabel}>Опубликовать как:</span>
                      <div className={styles.publishChoice}>
                        <button
                          className={styles.publishChoiceBtn}
                          disabled={isPublishing || busy}
                          onClick={() => { setExpandedPublish(null); onPublish(poll.id, true); }}
                        >С именем</button>
                        <button
                          className={styles.publishChoiceBtn}
                          disabled={isPublishing || busy}
                          onClick={() => { setExpandedPublish(null); onPublish(poll.id, false); }}
                        >Анонимно</button>
                        <button
                          className={styles.publishCancelBtn}
                          onClick={() => setExpandedPublish(null)}
                        >✕</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className={styles.footerLabel}>Видно только тебе</span>
                      <button
                        className={styles.publishBtn}
                        disabled={busy}
                        onClick={() => setExpandedPublish(poll.id)}
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

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.container}>
      <div className={styles.stickyHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <div className={styles.headerTitle}>Мои тир-листы</div>
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.list}>
        {savedPolls.length === 0 ? (
          <div className={styles.emptyState}>
            Сохранённых тир-листов нет.<br />
            <span className={styles.emptyHint}>Создай тир-лист и нажми «Сохранить шаблон».</span>
          </div>
        ) : (
          savedPolls.map(poll => (
            <div key={poll.id} className={styles.pollWrap}>
              <button onClick={() => onSelect(poll)} disabled={busy} className={styles.pollCard}>
                <span className={styles.pollEmoji}>{poll.emoji}</span>
                <div className={styles.pollBody}>
                  <div className={styles.pollNameRow}>
                    <span className={styles.pollName}>{poll.name}</span>
                    {poll.is_public && <span className={styles.publicBadge}>🌍</span>}
                  </div>
                  <div className={styles.pollTags}>
                    {poll.options.map(opt => (
                      <span key={opt} className={styles.pollTag}>{opt}</span>
                    ))}
                  </div>
                </div>
                <span className={styles.pollArrow}>›</span>
              </button>

              <div className={styles.cardActions}>
                {poll.is_public ? (
                  <button
                    onClick={() => onUnpublish(poll.id)}
                    disabled={publishingId === poll.id || busy}
                    className={styles.unpublishBtn}
                    title="Снять с публикации"
                  >
                    {publishingId === poll.id ? '…' : '🌍'}
                  </button>
                ) : expandedId === poll.id ? (
                  <div className={styles.publishChoice}>
                    <button
                      className={styles.publishChoiceBtn}
                      disabled={publishingId === poll.id || busy}
                      onClick={() => { setExpandedId(null); onPublish(poll.id, true); }}
                    >С именем</button>
                    <button
                      className={styles.publishChoiceBtn}
                      disabled={publishingId === poll.id || busy}
                      onClick={() => { setExpandedId(null); onPublish(poll.id, false); }}
                    >Анонимно</button>
                    <button
                      className={styles.publishCancelBtn}
                      onClick={() => setExpandedId(null)}
                    >✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedId(poll.id)}
                    disabled={busy}
                    className={styles.publishBtn}
                    title="Опубликовать"
                  >
                    🌐
                  </button>
                )}
                <button
                  onClick={() => onDelete(poll.id)}
                  disabled={deletingId === poll.id || busy}
                  className={styles.deleteBtn}
                  aria-label={`Удалить ${poll.name}`}
                >🗑</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.createBtn} disabled={busy} onClick={onCreateNew}>
          + Создать новый тир-лист
        </button>
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

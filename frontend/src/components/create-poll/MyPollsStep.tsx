import type { SavedPoll } from '../../api/client.ts';
import styles from './MyPollsStep.module.css';

interface Props {
  busy: boolean;
  error: string;
  savedPolls: SavedPoll[];
  deletingId: string | null;
  onBack: () => void;
  onSelect: (poll: SavedPoll) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}

export function MyPollsStep({ busy, error, savedPolls, deletingId, onBack, onSelect, onDelete, onCreateNew }: Props) {
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
                  <div className={styles.pollName}>{poll.name}</div>
                  <div className={styles.pollTags}>
                    {poll.options.map(opt => (
                      <span key={opt} className={styles.pollTag}>{opt}</span>
                    ))}
                  </div>
                </div>
                <span className={styles.pollArrow}>›</span>
              </button>
              <button
                onClick={() => onDelete(poll.id)}
                disabled={deletingId === poll.id || busy}
                className={styles.deleteBtn}
                aria-label={`Удалить ${poll.name}`}
              >🗑</button>
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

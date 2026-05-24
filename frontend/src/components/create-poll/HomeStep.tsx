import type { SavedPoll } from '../../api/client.ts';
import styles from './HomeStep.module.css';

interface Props {
  customName: string;
  setCustomName: (v: string) => void;
  error: string;
  busy: boolean;
  savedPolls: SavedPoll[];
  savedPollsLoading: boolean;
  onNavigateMyPolls: () => void;
  onNavigatePresets: () => void;
  onNavigatePublicPolls: () => void;
  onCreate: () => void;
  onGenerateWithAi: () => void;
}

export function HomeStep({
  customName, setCustomName, error, busy,
  savedPolls, savedPollsLoading,
  onNavigateMyPolls, onNavigatePresets, onNavigatePublicPolls, onCreate, onGenerateWithAi,
}: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.emoji}>🗳️</div>
      <div className={styles.title}>Создать опрос</div>
      <div className={styles.subtitle}>
        Выбери тему — группа проголосует и выберет лучший вариант.
      </div>

      <button className={styles.primaryBtn} disabled={busy} onClick={onNavigatePresets}>
        Выбрать тему →
      </button>

      <div className={styles.myPollsWrap}>
        <button className={styles.secondaryBtn} disabled={busy} onClick={onNavigatePublicPolls}>
          <span className={styles.myPollsLeft}>
            <span className={styles.myPollsLeftEmoji}>🌍</span>
            <span>Публичные опросы</span>
          </span>
          <span className={styles.myPollsRight}>
            <span className={styles.myPollsArrow}>›</span>
          </span>
        </button>
      </div>

      {savedPolls.length > 0 && (
        <div className={styles.myPollsWrap}>
          <button className={styles.secondaryBtn} disabled={busy} onClick={onNavigateMyPolls}>
            <span className={styles.myPollsLeft}>
              <span className={styles.myPollsLeftEmoji}>⭐</span>
              <span>Мои опросы</span>
            </span>
            <span className={styles.myPollsRight}>
              {savedPollsLoading ? (
                <span className={styles.myPollsCount}>…</span>
              ) : (
                <span className={styles.myPollsCount}>{savedPolls.length}</span>
              )}
              <span className={styles.myPollsArrow}>›</span>
            </span>
          </button>
        </div>
      )}

      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span className={styles.dividerLabel}>или</span>
        <div className={styles.dividerLine} />
      </div>

      <div className={styles.sectionLabel}>Свой вариант</div>
      <input
        className={styles.input}
        placeholder="Название опроса…"
        value={customName}
        onChange={e => setCustomName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCreate(); } }}
        autoFocus
      />
      {error && <div className={styles.errorText}>{error}</div>}
      <div className={styles.bottomActions}>
        <button
          className={styles.aiBtn}
          disabled={busy || !customName.trim()}
          onClick={onGenerateWithAi}
        >
          Сгенерировать с ИИ ✨
        </button>
        <button
          className={styles.ghostBtn}
          disabled={busy}
          onClick={onCreate}
        >
          {busy ? 'Создаём…' : 'Создать пустой опрос'}
        </button>
      </div>
    </div>
  );
}

import type { SavedPoll } from '../../api/client.ts';
import logoUrl from '../../assets/grouptier-logo.png';
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
  onCreate: () => void;
  onGenerateWithAi: () => void;
}

export function HomeStep({
  customName,
  setCustomName,
  error,
  busy,
  savedPolls,
  savedPollsLoading,
  onNavigateMyPolls,
  onNavigatePresets,
  onCreate,
  onGenerateWithAi,
}: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <img src={logoUrl} alt="GroupTier" className={styles.logo} />
        <div className={styles.subtitle}>
          Создай тир-лист — группа проголосует и определит лучший вариант.
        </div>
      </div>

      <button type="button" className={styles.primaryBtn} disabled={busy} onClick={onNavigatePresets}>
        <span>Выбрать шаблон</span>
        <span>→</span>
      </button>

      {savedPolls.length > 0 && (
        <div className={styles.myPollsWrap}>
          <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={onNavigateMyPolls}>
            <span className={styles.myPollsLeft}>
              <span className={styles.myPollsIcon}>⭐</span>
              <span>Мои шаблоны</span>
            </span>
            <span className={styles.myPollsRight}>
              <span className={styles.myPollsCount}>{savedPollsLoading ? '…' : savedPolls.length}</span>
              <span className={styles.myPollsArrow}>›</span>
            </span>
          </button>
        </div>
      )}

      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span>ИЛИ</span>
        <div className={styles.dividerLine} />
      </div>

      <div className={styles.sectionLabel}>СВОЙ ВАРИАНТ</div>
      <input
        className={styles.input}
        placeholder="Название тир-листа…"
        value={customName}
        onChange={(e) => setCustomName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCreate();
          }
        }}
      />
      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.bottomActions}>
        <button
          type="button"
          className={styles.aiBtn}
          disabled={busy || !customName.trim()}
          onClick={onGenerateWithAi}
        >
          <span>Сгенерировать с ИИ</span>
          <span className={styles.aiSpark}>✦</span>
        </button>
        <button type="button" className={styles.ghostBtn} disabled={busy} onClick={onCreate}>
          {busy ? 'Создаём…' : 'Создать пустой тир-лист'}
        </button>
      </div>

      <div className={styles.spacer} />
    </div>
  );
}

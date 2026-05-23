import { useState } from 'react';
import styles from './ShareStep.module.css';

interface Props {
  shareUrl: string;
  sessionId: string;
  onDone: () => void;
}

export function ShareStep({ shareUrl, sessionId, onDone }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback: select the text in the link box
    });
  }

  function handleSendToTelegram() {
    window.Telegram?.WebApp?.switchInlineQuery?.(sessionId, ['users', 'groups', 'channels']);
  }

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.heroEmoji}>🎉</div>
        <div className={styles.heroTitle}>Опрос готов!</div>
        <div className={styles.heroSubtitle}>
          Поделись ссылкой — проголосовать можно без бота в группе
        </div>
      </div>

      <div className={styles.linkBox}>
        <div className={styles.linkLabel}>Ссылка на голосование</div>
        <div className={styles.linkValue}>{shareUrl}</div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleCopy}
          className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnCopied}` : ''}`}
        >
          {copied ? '✓ Скопировано!' : 'Скопировать ссылку'}
        </button>

        <button onClick={handleSendToTelegram} className={styles.tgBtn}>
          Отправить в Telegram
        </button>
      </div>

      <div className={styles.spacer} />

      <button onClick={onDone} className={styles.doneBtn}>
        Поделился, продолжить →
      </button>
    </div>
  );
}

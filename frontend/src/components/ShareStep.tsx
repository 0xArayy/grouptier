import { useState } from 'react';
import logoUrl from '../assets/grouptier-logo.png';
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
    }).catch(() => {});
  }

  function handleSendToTelegram() {
    window.Telegram?.WebApp?.switchInlineQuery?.(sessionId, ['users', 'groups', 'channels']);
  }

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <img src={logoUrl} alt="GroupTier" className={styles.heroLogo} />
        <div className={styles.heroTitle}>Тир-лист готов</div>
        <div className={styles.heroSubtitle}>
          Поделись ссылкой — голосовать можно без бота в группе.
        </div>
      </div>

      <div className={styles.linkBox}>
        <div className={styles.linkLabel}>ССЫЛКА НА ГОЛОСОВАНИЕ</div>
        <div className={styles.linkValue}>{shareUrl}</div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleCopy}
          className={`${styles.copyBtn}${copied ? ` ${styles.copyBtnCopied}` : ''}`}
        >
          {copied ? '✓ Скопировано!' : '📋 Скопировать ссылку'}
        </button>

        <button onClick={handleSendToTelegram} className={styles.tgBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21.5 3.5 2.5 11l6 2.2 9-7-7 8 1 6.3 3-3 4.5 3.5 3.5-17z" fill="currentColor" />
          </svg>
          Отправить в Telegram
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.continueCard}>
        <div className={styles.continueCheck}>✓</div>
        <div className={styles.continueText}>
          <div className={styles.continueTitle}>Поделился?</div>
          <div className={styles.continueSub}>Пройди тир-лист и следи за результатом</div>
        </div>
        <button onClick={onDone} className={styles.continueBtn}>
          Дальше <span>→</span>
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';

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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 16px 24px',
      gap: 24,
      minHeight: '100dvh',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Опрос готов!
        </div>
        <div style={{ fontSize: 14, color: 'var(--tg-theme-hint-color)', lineHeight: 1.5 }}>
          Поделись ссылкой — проголосовать можно без бота в группе
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 12, color: 'var(--tg-theme-hint-color)', marginBottom: 6, fontWeight: 500 }}>
          Ссылка на голосование
        </div>
        <div style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 13,
          color: 'var(--tg-theme-text-color)',
          wordBreak: 'break-all',
          lineHeight: 1.5,
          fontFamily: 'monospace',
          userSelect: 'text',
        }}>
          {shareUrl}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={handleCopy}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 10,
            border: 'none',
            background: copied ? '#7ED957' : '#FF4D4D',
            color: '#fff',
            fontSize: 15,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
            boxShadow: copied ? '0 2px 8px rgba(126,217,87,0.3)' : '0 2px 8px rgba(255,77,77,0.3)',
          }}
        >
          {copied ? '✓ Скопировано!' : 'Скопировать ссылку'}
        </button>

        <button
          onClick={handleSendToTelegram}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 10,
            border: 'none',
            background: 'var(--tg-theme-secondary-bg-color)',
            color: '#FF4D4D',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Отправить в Telegram
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={onDone}
        style={{
          width: '100%',
          maxWidth: 400,
          height: 44,
          borderRadius: 10,
          border: 'none',
          background: 'transparent',
          color: 'var(--tg-theme-hint-color)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Поделился, продолжить →
      </button>
    </div>
  );
}

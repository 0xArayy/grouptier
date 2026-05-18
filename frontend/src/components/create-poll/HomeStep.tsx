import type { SavedPoll } from '../../api/client.ts';

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
}

export function HomeStep({
  customName, setCustomName, error, busy,
  savedPolls, savedPollsLoading,
  onNavigateMyPolls, onNavigatePresets, onCreate,
}: Props) {
  const primaryBtn: React.CSSProperties = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    boxShadow: '0 2px 8px var(--accent-shadow)',
    minHeight: 'var(--tap-target-min)',
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 400, margin: '0 auto' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Создать опрос</div>
      <div style={{ fontSize: 14, color: 'var(--text-hint)', marginBottom: 24 }}>
        Выбери тему — группа проголосует и выберет лучший вариант.
      </div>

      <div style={{ marginBottom: 20 }}>
        <button
          style={{
            ...primaryBtn,
            background: 'var(--surface)',
            color: 'var(--text)',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
          disabled={busy}
          onClick={onNavigateMyPolls}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⭐</span>
            <span>Мои опросы</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {savedPollsLoading ? (
              <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>…</span>
            ) : savedPolls.length > 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 500 }}>{savedPolls.length}</span>
            ) : null}
            <span style={{ fontSize: 18, color: 'var(--text-hint)' }}>›</span>
          </span>
        </button>
      </div>

      <button style={primaryBtn} disabled={busy} onClick={onNavigatePresets}>
        Выбрать тему →
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--surface)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-hint)', fontWeight: 500 }}>или</span>
        <div style={{ flex: 1, height: 1, background: 'var(--surface)' }} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hint)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
        Свой вариант
      </div>
      <input
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--surface)',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontSize: 15,
          boxSizing: 'border-box',
        }}
        placeholder="Название опроса…"
        value={customName}
        onChange={e => setCustomName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onCreate()}
        autoFocus
      />
      {error && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 10 }}>
        <button
          style={{
            ...primaryBtn,
            background: 'var(--surface)',
            color: 'var(--text)',
            boxShadow: 'none',
            opacity: busy ? 0.5 : 1,
          }}
          disabled={busy}
          onClick={onCreate}
        >
          {busy ? 'Создаём…' : 'Создать пустой опрос'}
        </button>
      </div>
    </div>
  );
}

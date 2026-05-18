import type { SavedPoll } from '../../api/client.ts';

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

  const pollCardStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '14px 12px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--surface)',
    background: 'var(--surface)',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.5 : 1,
    marginBottom: 10,
    textAlign: 'left',
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)',
        padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--surface)',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
        >←</button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Мои опросы</div>
      </div>

      {error && <div style={{ padding: '10px 16px', color: 'var(--accent)', fontSize: 13 }}>{error}</div>}

      <div style={{ padding: '12px 16px 32px' }}>
        {savedPolls.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-hint)', fontSize: 14, padding: '40px 0' }}>
            Сохранённых опросов нет.<br />
            <span style={{ fontSize: 12 }}>Создай опрос и нажми «Сохранить шаблон».</span>
          </div>
        ) : (
          savedPolls.map(poll => (
            <div key={poll.id} style={{ position: 'relative', marginBottom: 10 }}>
              <button onClick={() => onSelect(poll)} disabled={busy} style={pollCardStyle}>
                <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{poll.emoji}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{poll.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {poll.options.map(opt => (
                      <span key={opt} style={{
                        fontSize: 12, padding: '3px 8px', borderRadius: 'var(--radius-full)',
                        background: 'var(--bg)', color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap',
                      }}>{opt}</span>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--text-hint)', flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }}>›</span>
              </button>
              <button
                onClick={() => onDelete(poll.id)}
                disabled={deletingId === poll.id || busy}
                style={{
                  position: 'absolute', top: 8, right: 40,
                  background: 'none', border: 'none', fontSize: 16,
                  cursor: (deletingId === poll.id || busy) ? 'not-allowed' : 'pointer',
                  opacity: deletingId === poll.id ? 0.3 : 0.5,
                  padding: '4px', color: 'var(--text-hint)', lineHeight: 1,
                }}
                aria-label={`Удалить ${poll.name}`}
              >🗑</button>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '0 16px 32px' }}>
        <button style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={onCreateNew}>
          + Создать новый опрос
        </button>
      </div>

      {busy && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', gap: 12,
        }}>
          <div style={{ fontSize: 36 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Загружаем варианты…</div>
        </div>
      )}
    </div>
  );
}

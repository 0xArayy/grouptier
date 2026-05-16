import { useEffect, useRef, useState } from 'react';
import { fetchSession, submitResults, fetchActiveSession } from './api/client.ts';
import { Compare } from './components/Compare.tsx';
import { ByeScreen } from './components/ByeScreen.tsx';
import { TierList } from './components/TierList.tsx';
import { LiveResults } from './components/LiveResults.tsx';
import { CreatePoll } from './components/CreatePoll.tsx';
import { createTournament, pick, buildRankedList } from './lib/tournament.ts';
import type { TournamentState } from './lib/tournament.ts';

type Screen = 'loading' | 'error' | 'waiting' | 'compare' | 'bye' | 'tierlist' | 'live' | 'create';

interface SessionData {
  id: string;
  name: string;
  status: string;
  options: string[];
  voter_count: number;
  result_count: number;
  borda_ranking: { option: string; score: number }[];
  my_result: string[] | null;
}

function getUserId(): number {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return window.Telegram.WebApp.initDataUnsafe.user.id;
  }
  return 1; // dev fallback
}

function getSessionId(): string | null {
  // When opened via t.me/bot/app?startapp=ID the session id is in start_param, not URL.
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param
    ?? new URLSearchParams(window.location.search).get('session_id');
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(getSessionId);
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      // No session in URL — check if one exists in the group, else show CreatePoll
      fetchActiveSession()
        .then(active => {
          setSessionId(active.id);
        })
        .catch((err: unknown) => {
          const msg = String(err);
          if (msg.includes('404')) {
            setScreen('create');
          } else {
            setErrorMsg(msg);
            setScreen('error');
          }
        });
      return;
    }

    fetchSession(sessionId)
      .then((data: SessionData) => {
        setSession(data);

        if (data.status === 'collecting') {
          setScreen('create');
          return;
        }

        if (data.options.length < 2) {
          setScreen('waiting');
          return;
        }

        if (data.my_result) {
          // Already voted — go straight to live
          setScreen('live');
          setSubmitted(true);
          startPolling(sessionId);
          return;
        }

        if (data.status === 'closed') {
          setScreen('live');
          return;
        }

        // Start tournament
        const t = createTournament(data.options, getUserId());
        setTournament(t);
        const m = t.rounds[t.currentRound][t.currentMatchup];
        setScreen(m.isBye ? 'bye' : 'compare');
      })
      .catch((err: unknown) => {
        setErrorMsg(String(err));
        setScreen('error');
      });
  }, [sessionId]);

  function startPolling(sid: string) {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const data: SessionData = await fetchSession(sid);
        setSession(data);
        if (data.status === 'closed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {
        // silent — keep polling
      }
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handlePick(winner: string, loser: string) {
    if (!tournament || !sessionId) return;

    const next = pick(tournament, winner, loser);
    setTournament(next);

    if (next.champion !== null) {
      // Tournament done — show tier list
      setScreen('tierlist');
      return;
    }

    const nextMatchup = next.rounds[next.currentRound][next.currentMatchup];
    setScreen(nextMatchup.isBye ? 'bye' : 'compare');
  }

  function handleByeDone() {
    if (!tournament || !sessionId) return;
    // Auto-advance the bye option (it wins against nobody)
    const matchup = tournament.rounds[tournament.currentRound][tournament.currentMatchup];
    const next = pick(tournament, matchup.optionA, '__bye__');
    setTournament(next);

    if (next.champion !== null) {
      setScreen('tierlist');
      return;
    }

    const nextMatchup = next.rounds[next.currentRound][next.currentMatchup];
    setScreen(nextMatchup.isBye ? 'bye' : 'compare');
  }

  async function handleSubmit() {
    if (!tournament || !sessionId || submitting) return;
    setSubmitting(true);

    const rankedList = buildRankedList(tournament);
    try {
      const data = await submitResults(sessionId, rankedList);
      setSession(prev => prev ? { ...prev, ...data } : prev);
      setSubmitted(true);
      setScreen('live');
      startPolling(sessionId);
    } catch (err) {
      // Error shown inside TierList via re-thrown error
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  function handleShare() {
    if (!sessionId) return;
    // CP4: share button only after submission (we're on live screen = already submitted)
    window.Telegram?.WebApp?.switchInlineQuery?.(sessionId, ['groups']);
  }

  function handlePollReady(newSessionId: string) {
    setSessionId(newSessionId);
    setScreen('loading');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'create') {
    const existing = session?.status === 'collecting'
      ? { id: session.id, name: session.name, options: session.options }
      : undefined;
    return (
      <>
        {offline && <OfflineBanner />}
        <CreatePoll onSessionReady={handlePollReady} existingSession={existing} />
      </>
    );
  }

  if (screen === 'loading') {
    return (
      <>
        {offline && <OfflineBanner />}
        <CompareSkeleton />
      </>
    );
  }

  if (screen === 'error') {
    return (
      <>
        {offline && <OfflineBanner />}
        <FullCenter>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <div style={{ color: 'var(--text-hint)', fontSize: 15 }}>{errorMsg}</div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-hint)' }}>
              Open this link from Telegram.
            </div>
          </div>
        </FullCenter>
      </>
    );
  }

  if (screen === 'waiting') {
    const optCount = session?.options.length ?? 0;
    const isEmpty = optCount === 0;
    return (
      <>
        {offline && <OfflineBanner />}
        <FullCenter>
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 320 }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>{isEmpty ? '📭' : '⏳'}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {session?.name ?? 'Session'}
            </div>
            {isEmpty ? (
              <div style={{ color: 'var(--text-hint)', fontSize: 15, lineHeight: 1.5 }}>
                No options added yet. The group admin can add options and start voting from the Mini App.
              </div>
            ) : (
              <div style={{ color: 'var(--text-hint)', fontSize: 15, lineHeight: 1.5 }}>
                {optCount} option{optCount !== 1 ? 's' : ''} added. Waiting for admin to start voting.
              </div>
            )}
          </div>
        </FullCenter>
      </>
    );
  }

  if (screen === 'compare' && tournament) {
    const matchup = tournament.rounds[tournament.currentRound][tournament.currentMatchup];
    const numRounds = tournament.rounds.length;
    return (
      <>
        {offline && <OfflineBanner />}
        <Compare
          key={`${tournament.currentRound}-${tournament.currentMatchup}`}
          matchup={matchup}
          currentRound={tournament.currentRound}
          totalRounds={numRounds}
          completedMatchups={tournament.completedMatchups}
          totalMatchups={tournament.totalMatchups}
          onPick={handlePick}
        />
      </>
    );
  }

  if (screen === 'bye' && tournament) {
    const matchup = tournament.rounds[tournament.currentRound][tournament.currentMatchup];
    return (
      <>
        {offline && <OfflineBanner />}
        <ByeScreen option={matchup.optionA} onDone={handleByeDone} />
      </>
    );
  }

  if (screen === 'tierlist' && tournament) {
    const rankedList = buildRankedList(tournament);
    return (
      <>
        {offline && <OfflineBanner />}
        <TierList
          rankedList={rankedList}
          sessionClosed={session?.status === 'closed'}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </>
    );
  }

  if (screen === 'live' && session) {
    return (
      <>
        {offline && <OfflineBanner />}
        <LiveResults
          sessionName={session.name}
          bordaRanking={session.borda_ranking}
          resultCount={session.result_count}
          voterCount={session.voter_count}
          sessionClosed={session.status === 'closed'}
          onShare={submitted ? handleShare : undefined}
        />
      </>
    );
  }

  return <FullCenter><Spinner /></FullCenter>;
}

function OfflineBanner() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: '#c62828',
      color: '#fff',
      fontSize: 13,
      fontWeight: 500,
      textAlign: 'center',
      padding: '8px 16px',
    }}>
      No internet connection
    </div>
  );
}

function CompareSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px',
      gap: 24,
      flex: 1,
    }}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 100, height: 14 }} />
        <div className="skeleton" style={{ width: '100%', height: 4 }} />
        <div className="skeleton" style={{ width: 40, height: 12 }} />
      </div>
      <div className="skeleton" style={{ width: 160, height: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 400, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: '100%', height: 80 }} />
        <div className="skeleton" style={{ width: 32, height: 16, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: '100%', height: 80 }} />
      </div>
    </div>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '100dvh' }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 36,
      height: 36,
      border: '3px solid var(--surface)',
      borderTop: '3px solid var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

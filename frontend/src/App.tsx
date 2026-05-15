import { useEffect, useRef, useState } from 'react';
import { fetchSession, submitResults } from './api/client.ts';
import { Compare } from './components/Compare.tsx';
import { ByeScreen } from './components/ByeScreen.tsx';
import { TierList } from './components/TierList.tsx';
import { LiveResults } from './components/LiveResults.tsx';
import { createTournament, pick, buildRankedList } from './lib/tournament.ts';
import type { TournamentState } from './lib/tournament.ts';

type Screen = 'loading' | 'error' | 'waiting' | 'compare' | 'bye' | 'tierlist' | 'live';

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
  return new URLSearchParams(window.location.search).get('session_id');
}

export default function App() {
  const sessionId = getSessionId();
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg('No session ID. Open this from a Telegram group.');
      setScreen('error');
      return;
    }

    fetchSession(sessionId)
      .then((data: SessionData) => {
        setSession(data);

        if (data.status === 'collecting') {
          setScreen('waiting');
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return <FullCenter><Spinner /></FullCenter>;
  }

  if (screen === 'error') {
    return (
      <FullCenter>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ color: 'var(--text-hint)', fontSize: 15 }}>{errorMsg}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-hint)' }}>
            Open this link from Telegram.
          </div>
        </div>
      </FullCenter>
    );
  }

  if (screen === 'waiting') {
    return (
      <FullCenter>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {session?.name ?? 'Session'}
          </div>
          <div style={{ color: 'var(--text-hint)', fontSize: 15 }}>
            Waiting for options… Admin must use /vote to start.
          </div>
        </div>
      </FullCenter>
    );
  }

  if (screen === 'compare' && tournament) {
    const matchup = tournament.rounds[tournament.currentRound][tournament.currentMatchup];
    const numRounds = tournament.rounds.length;
    return (
      <Compare
        matchup={matchup}
        currentRound={tournament.currentRound}
        totalRounds={numRounds}
        completedMatchups={tournament.completedMatchups}
        totalMatchups={tournament.totalMatchups}
        onPick={handlePick}
      />
    );
  }

  if (screen === 'bye' && tournament) {
    const matchup = tournament.rounds[tournament.currentRound][tournament.currentMatchup];
    return <ByeScreen option={matchup.optionA} onDone={handleByeDone} />;
  }

  if (screen === 'tierlist' && tournament) {
    const rankedList = buildRankedList(tournament);
    return (
      <TierList
        rankedList={rankedList}
        sessionClosed={session?.status === 'closed'}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    );
  }

  if (screen === 'live' && session) {
    return (
      <LiveResults
        sessionName={session.name}
        bordaRanking={session.borda_ranking}
        resultCount={session.result_count}
        voterCount={session.voter_count}
        sessionClosed={session.status === 'closed'}
        onShare={submitted ? handleShare : undefined}
      />
    );
  }

  return <FullCenter><Spinner /></FullCenter>;
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

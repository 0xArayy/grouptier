import { useEffect, useRef, useState } from 'react';
import { fetchSession, submitResults, fetchActiveSession, closeSession, createSavedPoll, ApiError } from './api/client.ts';
import { Compare } from './components/Compare.tsx';
import { ByeScreen } from './components/ByeScreen.tsx';
import { TierList } from './components/TierList.tsx';
import { LiveResults } from './components/LiveResults.tsx';
import { CreatePoll } from './components/CreatePoll.tsx';
import { ShareStep } from './components/ShareStep.tsx';
import { createTournament, pick, buildRankedList } from './lib/tournament.ts';
import type { TournamentState } from './lib/tournament.ts';
import styles from './App.module.css';

type Screen = 'loading' | 'error' | 'waiting' | 'compare' | 'bye' | 'tierlist' | 'live' | 'create' | 'share';

interface SessionData {
  id: string;
  name: string;
  status: string;
  options: string[];
  voter_count: number;
  result_count: number;
  borda_ranking: { option: string; score: number }[];
  my_result: string[] | null;
  share_url?: string;
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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const pendingShareSessionId = useRef<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [submitError, setSubmitError] = useState('');
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

  function loadSession(id: string) {
    fetchSession(id)
      .then((data: SessionData) => {
        setSession(data);
        if (data.status === 'collecting') { setScreen('create'); return; }
        if (data.options.length < 2) { setScreen('waiting'); return; }
        if (data.my_result) { setScreen('live'); setSubmitted(true); startPolling(id); return; }
        if (data.status === 'closed') { setScreen('live'); return; }
        const t = createTournament(data.options, getUserId());
        setTournament(t);
        const m = t.rounds[t.currentRound][t.currentMatchup];
        setScreen(m.isBye ? 'bye' : 'compare');
      })
      .catch((err: unknown) => { setErrorMsg(String(err)); setScreen('error'); });
  }

  // Initial load
  useEffect(() => {
    if (!sessionId) {
      // No session in URL — check if one exists in the group, else show CreatePoll
      fetchActiveSession()
        .then(active => { setSessionId(active.id); })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) setScreen('create');
          else { setErrorMsg(String(err)); setScreen('error'); }
        });
      return;
    }
    loadSession(sessionId);
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

  async function handleSubmit(reorderedList: string[]) {
    if (!sessionId || submitting) return;
    setSubmitting(true);

    setSubmitError('');
    try {
      const data = await submitResults(sessionId, reorderedList);
      setSession(prev => prev ? { ...prev, ...data } : prev);
      setSubmitted(true);
      setScreen('live');
      startPolling(sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Session was closed while the user was on the tier list.
        // Redirect to group results — no point showing an error for something
        // the user can't fix. Refetch to get the latest borda_ranking.
        try {
          const fresh: SessionData = await fetchSession(sessionId);
          setSession(fresh);
        } catch { /* keep stale session data — live screen handles empty ranking */ }
        setScreen('live');
      } else {
        setSubmitError(String(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (!sessionId || closing) return;
    setClosing(true);
    try {
      await closeSession(sessionId);
      setSession(prev => prev ? { ...prev, status: 'closed' } : prev);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (err) {
      console.error('close failed:', err);
    } finally {
      setClosing(false);
    }
  }

  function handleShare() {
    if (!session) return;

    if (session.status === 'closed') {
      // Inline query → bot returns winner card photo → user picks chat → photo sent
      window.Telegram?.WebApp?.switchInlineQuery?.(session.id + ':winner', ['users', 'groups', 'channels']);
      return;
    }

    // Poll still open — inline query returns voting card photo with Vote button
    window.Telegram?.WebApp?.switchInlineQuery?.(session.id, ['users', 'groups', 'channels']);
  }

  function handleNewPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setSessionId(null);
    setSession(null);
    setShareUrl(null);
    setSubmitted(false);
    setTournament(null);
    setScreen('loading');
  }

  function handleGoHome() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setSessionId(null);
    setSession(null);
    setShareUrl(null);
    setSubmitted(false);
    setTournament(null);
    setScreen('create');
  }

  // Telegram BackButton — show on all non-home screens
  useEffect(() => {
    const tgBack = window.Telegram?.WebApp?.BackButton;
    if (!tgBack) return;
    if (screen === 'loading' || screen === 'create') {
      tgBack.hide();
      return;
    }
    tgBack.show();
    tgBack.onClick(handleGoHome);
    return () => { tgBack.offClick(handleGoHome); };
  }, [screen]);

  async function handleSaveTemplate(name: string, emoji: string) {
    const opts = session?.options ?? []; // snapshot before await — prevents polling race
    const trimmed = opts.map(o => o.trim()).filter(Boolean);
    await createSavedPoll(name, trimmed, emoji);
    sessionStorage.setItem(`saved-tmpl-${getUserId()}-${sessionId}`, '1');
  }

  function handlePollReady(newSessionId: string) {
    setScreen('loading');
    setSessionId(newSessionId);
    loadSession(newSessionId);
  }

  function handleShareReady(newSessionId: string, url: string) {
    pendingShareSessionId.current = newSessionId;
    setShareUrl(url);
    setScreen('share');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'share' && shareUrl) {
    return (
      <>
        {offline && <OfflineBanner />}
        <HomeButton onClick={handleGoHome} />
        <ShareStep
          shareUrl={shareUrl}
          sessionId={pendingShareSessionId.current ?? ''}
          onDone={() => {
            const sid = pendingShareSessionId.current;
            if (sid) handlePollReady(sid);
          }}
        />
      </>
    );
  }

  if (screen === 'create') {
    const existing = session?.status === 'collecting'
      ? { id: session.id, name: session.name, options: session.options, shareUrl: session.share_url }
      : undefined;
    return (
      <>
        {offline && <OfflineBanner />}
        <CreatePoll onSessionReady={handlePollReady} onShareReady={handleShareReady} existingSession={existing} />
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
        <HomeButton onClick={handleGoHome} />
        <FullCenter>
          <div className={styles.errorBox}>
            <div className={styles.errorEmoji}>⚠️</div>
            <div className={styles.errorText}>{errorMsg}</div>
            <div className={styles.errorHint}>Open this link from Telegram.</div>
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
        <HomeButton onClick={handleGoHome} />
        <FullCenter>
          <div className={styles.waitingBox}>
            <div className={styles.waitingEmoji}>{isEmpty ? '📭' : '⏳'}</div>
            <div className={styles.waitingTitle}>{session?.name ?? 'Session'}</div>
            {isEmpty ? (
              <div className={styles.waitingText}>
                No options added yet. The group admin can add options and start voting from the Mini App.
              </div>
            ) : (
              <div className={styles.waitingText}>
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
        <HomeButton onClick={handleGoHome} />
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
        <HomeButton onClick={handleGoHome} />
        <ByeScreen option={matchup.optionA} onDone={handleByeDone} />
      </>
    );
  }

  if (screen === 'tierlist' && tournament) {
    const rankedList = buildRankedList(tournament);
    return (
      <>
        {offline && <OfflineBanner />}
        <HomeButton onClick={handleGoHome} />
        <TierList
          rankedList={rankedList}
          sessionClosed={session?.status === 'closed'}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      </>
    );
  }

  if (screen === 'live' && session) {
    const initialSaved = sessionId
      ? sessionStorage.getItem(`saved-tmpl-${getUserId()}-${sessionId}`) === '1'
      : false;
    return (
      <>
        {offline && <OfflineBanner />}
        <HomeButton onClick={handleGoHome} />
        <LiveResults
          sessionName={session.name}
          bordaRanking={session.borda_ranking}
          resultCount={session.result_count}
          voterCount={session.voter_count}
          sessionClosed={session.status === 'closed'}
          onShare={submitted || session.status === 'closed' ? handleShare : undefined}
          onClose={session.status === 'voting' ? handleClose : undefined}
          closing={closing}
          onSaveTemplate={submitted ? handleSaveTemplate : undefined}
          initialSaved={initialSaved}
          onNewPoll={session.status === 'closed' ? handleNewPoll : undefined}
        />
      </>
    );
  }

  return <FullCenter><Spinner /></FullCenter>;
}

function HomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={styles.homeBtn}>
      ← Меню
    </button>
  );
}

function OfflineBanner() {
  return (
    <div className={styles.offlineBanner}>
      No internet connection
    </div>
  );
}

function CompareSkeleton() {
  return (
    <div className={styles.skeletonContainer}>
      <div className={styles.skeletonHeader}>
        <div className="skeleton" style={{ width: 100, height: 14 }} />
        <div className="skeleton" style={{ width: '100%', height: 4 }} />
        <div className="skeleton" style={{ width: 40, height: 12 }} />
      </div>
      <div className="skeleton" style={{ width: 160, height: 24 }} />
      <div className={styles.skeletonCards}>
        <div className="skeleton" style={{ width: '100%', height: 80 }} />
        <div className="skeleton" style={{ width: 32, height: 16, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: '100%', height: 80 }} />
      </div>
    </div>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.fullCenter}>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className={styles.spinner} />;
}

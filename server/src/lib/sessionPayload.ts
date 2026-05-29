import { type BordaResult, computeBorda } from '../db/borda.js';
import { pool } from '../db/client.js';
import { buildVoteUrl } from './urls.js';

/**
 * A crash between status='collecting'→'voting' flip and sendMessage leaves the session
 * with status='voting' but message_sent=false. Surface it as 'collecting' so the UI stays
 * functional. chat_id===null means chatless: message_sent is always false by design — must
 * not be treated as a crash recovery case.
 */
export function resolveEffectiveStatus(session: {
  status: string;
  message_sent: boolean;
  chat_id: unknown;
}): string {
  return session.status === 'voting' && !session.message_sent && session.chat_id !== null
    ? 'collecting'
    : session.status;
}

export interface SessionPayload {
  id: string;
  name: string;
  status: string;
  options: string[];
  voter_count: number;
  result_count: number;
  borda_ranking: BordaResult[];
  my_result: string[] | null;
  share_url: string;
}

/** Raw results rows used for per-subscriber my_result lookup. */
type ResultsRow = { user_id: number; ranked_list: string[] };

/**
 * Shared payload built ONCE per emitSession event and broadcast to all WS subscribers.
 * Subscribers extract their own my_result in-memory from resultsRows, avoiding N×4 DB
 * queries (N = connected clients per session).
 */
export interface SharedPayload {
  base: Omit<SessionPayload, 'my_result'>;
  resultsRows: ResultsRow[];
}

/**
 * Fetch the base session data once. Called by the broadcast coordinator in sessionEvents.ts.
 * Does NOT register the caller as a voter.
 */
export async function buildSharedPayload(id: string): Promise<SharedPayload | null> {
  const sessionRes = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  if (sessionRes.rows.length === 0) return null;
  const session = sessionRes.rows[0];

  const [optionsRes, countsRes, resultsRes] = await Promise.all([
    pool.query('SELECT text FROM options WHERE session_id = $1 ORDER BY created_at', [id]),
    // Single query for both counts — halves DB round-trips vs two separate COUNT queries
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM session_voters WHERE session_id = $1)::int AS voter_count,
         (SELECT COUNT(*) FROM user_results  WHERE session_id = $1)::int AS result_count`,
      [id],
    ),
    pool.query('SELECT user_id, ranked_list FROM user_results WHERE session_id = $1', [id]),
  ]);

  const options = optionsRes.rows.map((r: { text: string }) => r.text);
  const borda = computeBorda(resultsRes.rows.map((r: ResultsRow) => r.ranked_list));
  const effectiveStatus = resolveEffectiveStatus(session);

  return {
    base: {
      id: session.id,
      name: session.name ?? 'Untitled Session',
      status: effectiveStatus,
      options,
      voter_count: countsRes.rows[0].voter_count,
      result_count: countsRes.rows[0].result_count,
      borda_ranking: borda,
      share_url: buildVoteUrl(id),
    },
    resultsRows: resultsRes.rows as ResultsRow[],
  };
}

/** Merge a shared payload with a per-subscriber userId to produce the final SessionPayload. */
export function hydratePayload(shared: SharedPayload, userId: number | undefined): SessionPayload {
  const myResult =
    userId !== undefined
      ? (shared.resultsRows.find((r) => String(r.user_id) === String(userId))?.ranked_list ?? null)
      : null;
  return { ...shared.base, my_result: myResult };
}

/**
 * Fetch full session payload for REST endpoints (GET /api/sessions/:id).
 * Does NOT register the caller as a voter — that side-effect lives only in
 * GET /api/sessions/:id so voter counts stay accurate.
 */
export async function buildSessionPayload(id: string, userId?: number): Promise<SessionPayload | null> {
  const shared = await buildSharedPayload(id);
  if (!shared) return null;
  return hydratePayload(shared, userId);
}

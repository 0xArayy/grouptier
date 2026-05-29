import { pool } from '../db/client.js';
import { computeBorda, type BordaResult } from '../db/borda.js';
import { buildVoteUrl } from './urls.js';

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

/**
 * Fetch full session payload for WS push or REST response.
 * Does NOT register the caller as a voter — that side-effect lives only in
 * GET /api/sessions/:id so voter counts stay accurate.
 */
export async function buildSessionPayload(id: string, userId?: number): Promise<SessionPayload | null> {
  const sessionRes = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  if (sessionRes.rows.length === 0) return null;
  const session = sessionRes.rows[0];

  const [optionsRes, voterCount, resultCount, resultsRes] = await Promise.all([
    pool.query('SELECT text FROM options WHERE session_id = $1 ORDER BY created_at', [id]),
    pool.query('SELECT COUNT(*) FROM session_voters WHERE session_id = $1', [id]),
    pool.query('SELECT COUNT(*) FROM user_results WHERE session_id = $1', [id]),
    pool.query('SELECT user_id, ranked_list FROM user_results WHERE session_id = $1', [id]),
  ]);

  const options = optionsRes.rows.map((r: { text: string }) => r.text);
  const borda = computeBorda(resultsRes.rows.map((r: { user_id: number; ranked_list: string[] }) => r.ranked_list));

  const effectiveStatus =
    session.status === 'voting' && !session.message_sent && session.chat_id !== null
      ? 'collecting' : session.status;

  const myResult = userId !== undefined
    ? (resultsRes.rows.find((r: { user_id: number; ranked_list: string[] }) =>
        String(r.user_id) === String(userId))?.ranked_list ?? null)
    : null;

  return {
    id: session.id,
    name: session.name ?? 'Untitled Session',
    status: effectiveStatus,
    options,
    voter_count: parseInt(voterCount.rows[0].count),
    result_count: parseInt(resultCount.rows[0].count),
    borda_ranking: borda,
    my_result: myResult,
    share_url: buildVoteUrl(id),
  };
}

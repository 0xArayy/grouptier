import { pool } from '../db/client.js';
import { buildVoteUrl } from './urls.js';
import { MAX_NAME_LENGTH } from './constants.js';

interface TelegramChat { id: number | string }

interface CreateSessionResult {
  id: string;
  share_url: string;
}

interface ConflictResult {
  conflict: true;
  id: string;
  share_url: string;
}

export type CreateSessionOutcome = { conflict: false } & CreateSessionResult | ConflictResult;

/**
 * Insert a new collecting session, enforcing one-per-chat 409 guard.
 * Returns {conflict:false, id, share_url} on success or
 * {conflict:true, id, share_url} when the chat already has a collecting session.
 */
export async function createSession(
  chat: TelegramChat | null | undefined,
  userId: number,
  rawName: string,
): Promise<CreateSessionOutcome> {
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH) || 'Untitled Session';

  if (chat) {
    const existing = await pool.query(
      "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
      [chat.id],
    );
    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id as string;
      return { conflict: true, id: existingId, share_url: buildVoteUrl(existingId) };
    }
  }

  try {
    const res = await pool.query<{ id: string }>(
      "INSERT INTO sessions (chat_id, creator_user_id, name, status) VALUES ($1, $2, $3, 'collecting') RETURNING id",
      [chat?.id ?? null, userId, name],
    );
    const newId = res.rows[0].id;
    return { conflict: false, id: newId, share_url: buildVoteUrl(newId) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505' && chat) {
      const fallback = await pool.query(
        "SELECT id FROM sessions WHERE chat_id = $1 AND status = 'collecting' LIMIT 1",
        [chat.id],
      );
      const fallbackId = fallback.rows[0]?.id as string | undefined;
      if (fallbackId) {
        return { conflict: true, id: fallbackId, share_url: buildVoteUrl(fallbackId) };
      }
    }
    throw err;
  }
}

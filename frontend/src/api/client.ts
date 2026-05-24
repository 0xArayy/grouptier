const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error?: string; id?: string; [key: string]: unknown },
  ) {
    super(body.error ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

async function throwOnError(res: Response): Promise<void> {
  if (res.ok) return;
  let body: { error?: string; id?: string } = {};
  try { body = await res.json(); } catch { /* non-JSON body, leave body empty */ }
  throw new ApiError(res.status, body);
}

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  // Dev fallback — server allows this in non-production
  return import.meta.env.DEV ? 'dev' : '';
}

export async function createSession(name: string): Promise<{ id: string; share_url: string }> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name }),
  });
  await throwOnError(res);
  return res.json();
}

export async function fetchActiveSession(): Promise<{ id: string; name: string; status: string }> {
  const res = await fetch(`${BASE}/sessions/active`, {
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function updateSessionName(sessionId: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name }),
  });
  await throwOnError(res);
}

export async function addOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ text }),
  });
  await throwOnError(res);
  return res.json();
}

export async function bulkReplaceOptions(sessionId: string, options: string[], name?: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ options, ...(name !== undefined && { name }) }),
  });
  await throwOnError(res);
  return res.json();
}

export async function removeOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options/${encodeURIComponent(text)}`, {
    method: 'DELETE',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function startVoting(sessionId: string): Promise<{ share_url?: string }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/vote`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function fetchSessionOptions(sessionId: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, {
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function closeSession(sessionId: string): Promise<{ ok: boolean; winner: string | null }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/close`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export interface SavedPoll {
  id: string;
  name: string;
  options: string[];
  emoji: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchSavedPolls(): Promise<SavedPoll[]> {
  const res = await fetch(`${BASE}/saved-polls`, {
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function createSavedPoll(name: string, options: string[], emoji: string): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/saved-polls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name, options, emoji }),
  });
  await throwOnError(res);
  return res.json();
}

export async function updateSavedPoll(id: string, data: { name?: string; options?: string[]; emoji?: string }): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify(data),
  });
  await throwOnError(res);
}

export async function deleteSavedPoll(id: string): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}`, {
    method: 'DELETE',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
}

export async function generateAiOptions(
  name: string,
  existingOptions?: string[],
): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/ai/generate-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name, ...(existingOptions?.length ? { existingOptions } : {}) }),
  });
  await throwOnError(res);
  return res.json();
}

export interface PublicPoll {
  id: string;
  name: string;
  emoji: string;
  author_name: string | null;
  uses_count: number;
  option_count: number;
}

export async function searchPublicPolls(q?: string): Promise<PublicPoll[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await fetch(`${BASE}/public-polls${params}`, {
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function usePublicPoll(id: string): Promise<{ id: string; share_url: string; name: string; options: string[] }> {
  const res = await fetch(`${BASE}/public-polls/${id}/use`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
  return res.json();
}

export async function publishSavedPoll(id: string, showAuthor = true): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ show_author: showAuthor }),
  });
  await throwOnError(res);
}

export async function unpublishSavedPoll(id: string): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}/unpublish`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  await throwOnError(res);
}

export async function submitResults(sessionId: string, rankedList: string[]) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-init-data': getInitData(),
    },
    body: JSON.stringify({ ranked_list: rankedList }),
  });
  await throwOnError(res);
  return res.json();
}

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
  try {
    body = await res.json();
  } catch {
    /* non-JSON body, leave body empty */
  }
  throw new ApiError(res.status, body);
}

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  // Dev fallback — server allows this in non-production
  return import.meta.env.DEV ? 'dev' : '';
}

async function apiFetch(url: string, opts: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const { json, headers: extraHeaders, ...rest } = opts;
  const h: Record<string, string> = { 'x-init-data': getInitData() };
  if (json !== undefined) h['Content-Type'] = 'application/json';
  return fetch(url, {
    ...rest,
    headers: { ...h, ...((extraHeaders as Record<string, string> | undefined) ?? {}) },
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
}

export async function createSession(name: string): Promise<{ id: string; share_url: string }> {
  const res = await apiFetch(`${BASE}/sessions`, { method: 'POST', json: { name } });
  await throwOnError(res);
  return res.json();
}

export async function fetchActiveSession(): Promise<{ id: string; name: string; status: string }> {
  const res = await apiFetch(`${BASE}/sessions/active`);
  await throwOnError(res);
  return res.json();
}

export async function updateSessionName(sessionId: string, name: string): Promise<void> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}`, { method: 'PATCH', json: { name } });
  await throwOnError(res);
}

export async function addOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/options`, { method: 'POST', json: { text } });
  await throwOnError(res);
  return res.json();
}

export async function bulkReplaceOptions(
  sessionId: string,
  options: string[],
  name?: string,
): Promise<{ options: string[] }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/options`, {
    method: 'PUT',
    json: { options, ...(name !== undefined && { name }) },
  });
  await throwOnError(res);
  return res.json();
}

export async function removeOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/options/${encodeURIComponent(text)}`, {
    method: 'DELETE',
  });
  await throwOnError(res);
  return res.json();
}

export async function startVoting(sessionId: string): Promise<{ share_url?: string }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/vote`, { method: 'POST' });
  await throwOnError(res);
  return res.json();
}

export async function fetchSessionOptions(sessionId: string): Promise<{ options: string[] }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/options`);
  await throwOnError(res);
  return res.json();
}

export async function fetchSession(sessionId: string) {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}`);
  await throwOnError(res);
  return res.json();
}

export async function closeSession(sessionId: string): Promise<{ ok: boolean; winner: string | null }> {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/close`, { method: 'POST' });
  await throwOnError(res);
  return res.json();
}

export interface SavedPoll {
  id: string;
  name: string;
  options: string[];
  emoji: string;
  is_public: boolean;
  categories: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchSavedPolls(): Promise<SavedPoll[]> {
  const res = await apiFetch(`${BASE}/saved-polls`);
  await throwOnError(res);
  return res.json();
}

export async function createSavedPoll(
  name: string,
  options: string[],
  emoji: string,
): Promise<{ id: string }> {
  const res = await apiFetch(`${BASE}/saved-polls`, { method: 'POST', json: { name, options, emoji } });
  await throwOnError(res);
  return res.json();
}

export async function updateSavedPoll(
  id: string,
  data: { name?: string; options?: string[]; emoji?: string },
): Promise<void> {
  const res = await apiFetch(`${BASE}/saved-polls/${id}`, { method: 'PUT', json: data });
  await throwOnError(res);
}

export async function deleteSavedPoll(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/saved-polls/${id}`, { method: 'DELETE' });
  await throwOnError(res);
}

export interface PublicTemplate {
  id: string;
  emoji: string;
  name: string;
  options: string[];
  author: string;
  official: boolean;
  hot: boolean;
  uses_7d: number;
  category: 'games' | 'food' | 'movies' | 'series' | 'music' | 'sport' | 'other';
  tags?: string[];
}

export async function fetchTemplates(signal?: AbortSignal): Promise<PublicTemplate[]> {
  const res = await apiFetch(`${BASE}/templates`, { signal });
  await throwOnError(res);
  const data: { items: PublicTemplate[] } = await res.json();
  return data.items;
}

export async function recordTemplateUse(id: string): Promise<void> {
  // best-effort: intentionally not using apiFetch — errors must never block the user flow
  try {
    await fetch(`${BASE}/templates/${id}/use`, {
      method: 'POST',
      headers: { 'x-init-data': getInitData() },
    });
  } catch {
    /* silent */
  }
}

export async function generateAiOptions(
  name: string,
  existingOptions?: string[],
): Promise<{ options: string[] }> {
  const res = await apiFetch(`${BASE}/ai/generate-options`, {
    method: 'POST',
    json: { name, ...(existingOptions?.length ? { existingOptions } : {}) },
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
  categories: string[];
  matched_option?: string | null;
}

export async function searchPublicPolls(
  q?: string,
  offset = 0,
): Promise<{ items: PublicPoll[]; nextOffset: number | null }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.size ? `?${params.toString()}` : '';
  const res = await apiFetch(`${BASE}/public-polls${qs}`);
  await throwOnError(res);
  return res.json();
}

export async function applyPublicPoll(
  id: string,
): Promise<{ id: string; share_url: string; name: string; options: string[] }> {
  const res = await apiFetch(`${BASE}/public-polls/${id}/use`, { method: 'POST' });
  await throwOnError(res);
  return res.json();
}

export async function publishSavedPoll(id: string, showAuthor: boolean, categories: string[]): Promise<void> {
  const res = await apiFetch(`${BASE}/saved-polls/${id}/publish`, {
    method: 'POST',
    json: { show_author: showAuthor, categories },
  });
  await throwOnError(res);
}

export async function unpublishSavedPoll(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/saved-polls/${id}/unpublish`, { method: 'POST' });
  await throwOnError(res);
}

export async function submitResults(sessionId: string, rankedList: string[]) {
  const res = await apiFetch(`${BASE}/sessions/${sessionId}/results`, {
    method: 'POST',
    json: { ranked_list: rankedList },
  });
  await throwOnError(res);
  return res.json();
}

export interface SessionData {
  id: string;
  name: string;
  status: string;
  options: string[];
  voter_count: number;
  result_count: number;
  borda_ranking: { option: string; score: number }[];
  my_result: string[] | null;
  share_url: string;
}

export function connectSessionWs(
  sessionId: string,
  onData: (session: SessionData) => void,
  onClose: () => void,
): WebSocket {
  const initData = getInitData();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws/sessions/${sessionId}?initData=${encodeURIComponent(initData)}`;
  const ws = new WebSocket(url);
  ws.onmessage = (e) => onData(JSON.parse(e.data as string) as SessionData);
  ws.onclose = onClose;
  return ws;
}

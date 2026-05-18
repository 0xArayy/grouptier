const BASE = '/api';

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  // Dev fallback — server allows this in non-production
  return import.meta.env.DEV ? 'dev' : '';
}

export async function createSession(name: string): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchActiveSession(): Promise<{ id: string; name: string; status: string }> {
  const res = await fetch(`${BASE}/sessions/active`, {
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateSessionName(sessionId: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function addOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function removeOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options/${encodeURIComponent(text)}`, {
    method: 'DELETE',
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function startVoting(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/vote`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function fetchSessionOptions(sessionId: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, {
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function closeSession(sessionId: string): Promise<{ ok: boolean; winner: string | null }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/close`, {
    method: 'POST',
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export interface SavedPoll {
  id: string;
  name: string;
  options: string[];
  emoji: string;
  created_at: string;
  updated_at: string;
}

export async function fetchSavedPolls(): Promise<SavedPoll[]> {
  const res = await fetch(`${BASE}/saved-polls`, {
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createSavedPoll(name: string, options: string[], emoji: string): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/saved-polls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ name, options, emoji }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateSavedPoll(id: string, data: { name?: string; options?: string[]; emoji?: string }): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteSavedPoll(id: string): Promise<void> {
  const res = await fetch(`${BASE}/saved-polls/${id}`, {
    method: 'DELETE',
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
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
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

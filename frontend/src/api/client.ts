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

export async function addOption(sessionId: string, text: string): Promise<{ options: string[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-init-data': getInitData() },
    body: JSON.stringify({ text }),
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

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}`, {
    headers: { 'x-init-data': getInitData() },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
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

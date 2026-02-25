// API service layer

const API_BASE = '/api';

export async function fetchSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
}

export async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function fetchMessages(
  sessionId: string,
  limit = 30,
  before?: string
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages?${params}`
  );
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
}

export async function sendMessage(sessionId: string, message: string) {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }
  );
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

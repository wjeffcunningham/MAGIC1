const SESSION_KEY = "bcwl_session_v1";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function setSession({ playerId, username, fullName, authUserId }) {
  const now = Date.now();
  const payload = {
    playerId,
    username,
    fullName,
    authUserId: authUserId || null,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function requireSession() {
  const session = getSession();
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
  }
  return session;
}
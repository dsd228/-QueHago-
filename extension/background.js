const ALLOWED_LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    const origin = url.origin;
    return ALLOWED_LOCAL_ORIGINS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'QH_SESSION_GET') {
    fetchSession(message.origin, message.token)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'SESSION_FETCH_FAILED' }));
    return true;
  }

  if (message?.type === 'QH_GUIDE_ANALYZE') {
    analyzePage(message.origin, message.token, message.page)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'GUIDE_ANALYZE_FAILED' }));
    return true;
  }
});

async function fetchSession(rawOrigin, token) {
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) throw new Error('QH_ORIGIN_NOT_ALLOWED');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token || ''))) throw new Error('QH_TOKEN_INVALID');

  const response = await fetch(`${origin}/api/guide/session/${encodeURIComponent(token)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`QH_SESSION_HTTP_${response.status}`);
  return response.json();
}

async function analyzePage(rawOrigin, token, page) {
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) throw new Error('QH_ORIGIN_NOT_ALLOWED');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token || ''))) throw new Error('QH_TOKEN_INVALID');

  const response = await fetch(`${origin}/api/guide/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ token, page }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error || `QH_GUIDE_HTTP_${response.status}`;
    throw new Error(error);
  }
  return data;
}

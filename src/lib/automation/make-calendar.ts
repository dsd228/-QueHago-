export type CalendarPayload = {
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  description: string;
  location: string;
  analysis_id: string;
};

export type CalendarResult = {
  ok: true;
  event_id: string;
  event_url: string;
  source: string;
};

export type CalendarDeleteResult = {
  ok: true;
  event_id: string;
  source: string;
};

function secureWebhookUrl(raw: string | undefined, missingCode: string): URL {
  const value = raw?.trim();
  if (!value) throw new Error(missingCode);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("MAKE_WEBHOOK_INVALID");
  }

  if (parsed.protocol !== "https:") throw new Error("MAKE_WEBHOOK_INVALID");
  return parsed;
}

function apiKey(): string {
  const value = process.env.MAKE_CALENDAR_WEBHOOK_API_KEY?.trim();
  if (!value) throw new Error("MAKE_API_KEY_MISSING");
  return value;
}

async function postJson(url: URL, payload: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-make-apikey": apiKey(),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`MAKE_HTTP_${response.status}`);

  try {
    return await response.json();
  } catch {
    throw new Error("MAKE_INVALID_RESPONSE");
  }
}

function validateCalendarResult(value: unknown): CalendarResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true) return null;
  if (typeof row.event_id !== "string" || !row.event_id) return null;
  if (typeof row.event_url !== "string" || !row.event_url) return null;
  if (typeof row.source !== "string") return null;

  try {
    const url = new URL(row.event_url);
    if (url.protocol !== "https:" || !(url.hostname === "google.com" || url.hostname.endsWith(".google.com"))) return null;
  } catch {
    return null;
  }

  return {
    ok: true,
    event_id: row.event_id,
    event_url: row.event_url,
    source: row.source,
  };
}

function validateDeleteResult(value: unknown): CalendarDeleteResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true) return null;
  if (typeof row.event_id !== "string" || !row.event_id) return null;
  if (typeof row.source !== "string") return null;
  return { ok: true, event_id: row.event_id, source: row.source };
}

export async function createMakeCalendarEvent(payload: CalendarPayload): Promise<CalendarResult> {
  const webhook = secureWebhookUrl(process.env.MAKE_CALENDAR_WEBHOOK_URL, "MAKE_WEBHOOK_MISSING");
  const result = validateCalendarResult(await postJson(webhook, payload));
  if (!result) throw new Error("MAKE_INVALID_RESPONSE");
  return result;
}

export async function deleteMakeCalendarEvent(
  eventId: string,
  analysisId: string,
): Promise<CalendarDeleteResult> {
  const webhook = secureWebhookUrl(
    process.env.MAKE_CALENDAR_DELETE_WEBHOOK_URL,
    "MAKE_DELETE_WEBHOOK_MISSING",
  );
  const result = validateDeleteResult(await postJson(webhook, {
    event_id: eventId,
    analysis_id: analysisId,
  }));
  if (!result) throw new Error("MAKE_INVALID_RESPONSE");
  return result;
}

import { NextResponse } from "next/server";
import { analyzeGuidePage, sanitizeGuidePage, type GuidePage } from "@/lib/guide-analyzer";
import { getGuideSession } from "@/lib/guide-sessions";
import { repairAmbiguousGuideTargets } from "@/lib/guide-target-repair";
import { normalizeHost } from "@/lib/trusted-sources";

const MAX_BODY_BYTES = 180_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

function hostAllowed(rawUrl: string, trustedDomains: string[]): boolean {
  let host = "";
  try {
    host = normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return false;
  }

  return trustedDomains.some((domain) => {
    const trusted = normalizeHost(domain);
    return host === trusted || host.endsWith(`.${trusted}`);
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: "PAGE_TOO_LARGE" }, 413);

  let body: { token?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return json({ ok: false, error: "TOKEN_REQUIRED" }, 400);

  const session = getGuideSession(token);
  if (!session || session.status !== "active") {
    return json({ ok: false, error: "GUIDE_SESSION_NOT_FOUND" }, 404);
  }

  const page = sanitizeGuidePage((body.page || {}) as GuidePage);
  if (!page.url || !hostAllowed(page.url, session.trustedDomains)) {
    return json({
      ok: false,
      error: "UNTRUSTED_CURRENT_DOMAIN",
      sourceName: session.sourceName,
      trustedDomains: session.trustedDomains,
    }, 403);
  }

  const analyzed = await analyzeGuidePage(session.goal, page);
  const plan = repairAmbiguousGuideTargets(analyzed, page.elements);

  return json({
    ok: true,
    sourceName: session.sourceName,
    trustedDomains: session.trustedDomains,
    plan,
  });
}

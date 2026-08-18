import { NextResponse } from "next/server";
import { getGuideSession } from "@/lib/guide-sessions";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = getGuideSession(token);

  if (!session || session.status !== "active") {
    return json({ ok: false, error: "GUIDE_SESSION_NOT_FOUND" }, 404);
  }

  return json({
    ok: true,
    session: {
      token: session.token,
      sourceId: session.sourceId,
      sourceName: session.sourceName,
      officialUrl: session.officialUrl,
      trustedDomains: session.trustedDomains,
      goal: session.goal,
      expiresAt: session.expiresAt,
    },
  });
}

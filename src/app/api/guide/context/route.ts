import { NextResponse } from "next/server";
import { appendGuideSessionContext } from "@/lib/guide-sessions";

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  let body: { token?: unknown; answer?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.replace(/\s+/g, " ").trim() : "";

  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return json({ ok: false, error: "TOKEN_INVALID" }, 400);
  if (answer.length < 2 || answer.length > 200) return json({ ok: false, error: "ANSWER_INVALID" }, 400);

  const looksSensitive = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(answer)
    || /(?:\+?\d[\s().-]*){7,}/.test(answer)
    || /\b(?:clave|contraseña|password|pin|token|otp|codigo de seguridad)\b\s*[:=-]?\s*\S+/i.test(answer);

  if (looksSensitive) {
    return json({
      ok: false,
      error: "SENSITIVE_CONTEXT_REJECTED",
      message: "Escribí sólo el tipo de trámite, sin CUIL, DNI, claves, códigos, teléfonos ni correos.",
    }, 400);
  }

  const session = appendGuideSessionContext(token, answer);
  if (!session) return json({ ok: false, error: "GUIDE_SESSION_NOT_FOUND" }, 404);

  return json({
    ok: true,
    session: {
      sourceName: session.sourceName,
      trustedDomains: session.trustedDomains,
      expiresAt: session.expiresAt,
    },
  });
}

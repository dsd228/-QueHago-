import { NextResponse } from "next/server";
import { getGuideSession } from "@/lib/guide-sessions";
import { analyzeSharedScreen } from "@/lib/screen-guide";

const MAX_IMAGE_CHARS = 2_400_000;

export async function POST(request: Request) {
  let body: { token?: unknown; image?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const image = typeof body.image === "string" ? body.image.trim() : "";

  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }
  if (!image.startsWith("data:image/jpeg;base64,") || image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 400 });
  }

  const session = getGuideSession(token);
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  try {
    const result = await analyzeSharedScreen({
      imageDataUrl: image,
      goal: session.goal,
      sourceName: session.sourceName,
    });
    return NextResponse.json({ result }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("[QueHago] resolver vision failed", error);
    return NextResponse.json({ error: "SCREEN_ANALYSIS_FAILED" }, { status: 502 });
  }
}

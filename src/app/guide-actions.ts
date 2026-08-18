"use server";

import { redirect } from "next/navigation";
import { getAnalysisById } from "@/lib/data";
import { createGuideSession } from "@/lib/guide-sessions";

function publicOrigin(): string {
  const configured = process.env.QUEHAGO_PUBLIC_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function startVerifiedGuideAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}?guide=example`);

  let session;
  try {
    session = createGuideSession(item);
  } catch (error) {
    console.error("[QueHago] guide session failed", error);
    redirect(`/a/${analysisId}?guide=unavailable`);
  }

  const target = new URL(session.officialUrl);
  const fragment = new URLSearchParams({
    qh: session.token,
    qho: publicOrigin(),
  });
  target.hash = fragment.toString();

  redirect(target.toString());
}

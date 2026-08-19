"use server";

import { redirect } from "next/navigation";
import { getAnalysisById } from "@/lib/data";
import { createGuideSession } from "@/lib/guide-sessions";

export async function startWebResolutionAction(analysisId: string): Promise<void> {
  const item = getAnalysisById(analysisId);
  if (!item) redirect("/");
  if (item.isExample) redirect(`/a/${analysisId}`);

  try {
    const session = createGuideSession(item);
    redirect(`/resolver/${session.token}`);
  } catch (error) {
    console.error("[QueHago] web resolution start failed", error);
    redirect(`/a/${analysisId}`);
  }
}

import { notFound } from "next/navigation";
import { getGuideSession } from "@/lib/guide-sessions";
import ScreenResolutionRoom from "@/components/ScreenResolutionRoom";

export const dynamic = "force-dynamic";

export default async function ResolverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = getGuideSession(token);
  if (!session || session.status !== "active") notFound();

  return (
    <main className="resolution-page">
      <section className="resolution-heading">
        <p className="eyebrow">Resolución guiada</p>
        <h1>{session.goal}</h1>
        <p>
          Fuente de partida verificada: <strong>{session.sourceName}</strong> · {session.trustedDomains[0]}
        </p>
      </section>

      <ScreenResolutionRoom
        token={session.token}
        goal={session.goal}
        sourceName={session.sourceName}
        officialUrl={session.officialUrl}
        expiresAt={session.expiresAt}
      />
    </main>
  );
}

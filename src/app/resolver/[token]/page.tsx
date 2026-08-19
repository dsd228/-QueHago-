import { notFound } from "next/navigation";
import { getGuideSession } from "@/lib/guide-sessions";
import ScreenResolutionRoom from "@/components/ScreenResolutionRoom";

export const dynamic = "force-dynamic";

export default async function ResolverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = getGuideSession(token);
  if (!session || session.status !== "active") notFound();

  return (
    <main className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-10 sm:px-0 sm:py-14">
      <section className="max-w-4xl">
        <p className="eyebrow">Resolución guiada · web</p>
        <h1 className="mb-4 max-w-[15ch] text-[clamp(2.5rem,6vw,4.8rem)] leading-[.98] tracking-[-.055em]">{session.goal}</h1>
        <p className="max-w-3xl text-lg text-[var(--muted)]">
          Fuente de partida registrada: <strong className="text-[var(--ink)]">{session.sourceName}</strong> · {session.trustedDomains[0]}.
          ¿QuéHago? no puede leer otra pestaña por detrás: vos compartís la ventana cuando querés un checkpoint visual.
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

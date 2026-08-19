import type { ReactNode } from "react";
import { getAnalysisById } from "@/lib/data";
import { getGuideSource } from "@/lib/guide-sessions";
import { startWebResolutionAction } from "@/app/resolver/actions";

export default async function AnalysisLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = getAnalysisById(id);
  const source = item ? getGuideSource(item) : null;
  const startResolution = item ? startWebResolutionAction.bind(null, item.id) : null;

  return (
    <>
      {item && source && startResolution && !item.isExample ? (
        <section className="action-receipt" aria-labelledby="web-resolution-title">
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Ruta oficial disponible</p>
              <h2 id="web-resolution-title">Resolver desde {source.name}</h2>
              <p>
                ¿QuéHago? abre la fuente oficial registrada y te acompaña desde una sala web de resolución.
                No necesitás instalar extensiones.
              </p>
            </div>
            <span className="verified-chip">Fuente registrada</span>
          </div>

          <dl className="receipt-grid">
            <div>
              <dt>Entidad</dt>
              <dd>{source.name}</dd>
            </div>
            <div>
              <dt>Fuente de partida</dt>
              <dd>{source.trustedDomains[0]}</dd>
            </div>
            <div>
              <dt>Captura</dt>
              <dd>Sólo cuando la pedís</dd>
            </div>
            <div>
              <dt>Formato</dt>
              <dd>100% web</dd>
            </div>
          </dl>

          <div className="receipt-actions">
            <form action={startResolution}>
              <button className="button button-primary" type="submit">
                Abrir espacio de resolución
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {children}
    </>
  );
}

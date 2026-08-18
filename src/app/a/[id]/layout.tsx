import type { ReactNode } from "react";
import { getAnalysisById } from "@/lib/data";
import { getGuideSource } from "@/lib/guide-sessions";
import { startVerifiedGuideAction } from "@/app/guide-actions";

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
  const startGuide = item ? startVerifiedGuideAction.bind(null, item.id) : null;

  return (
    <>
      {item && source && startGuide && !item.isExample ? (
        <section className="action-receipt" aria-labelledby="verified-source-title">
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Ruta oficial disponible</p>
              <h2 id="verified-source-title">Resolver desde {source.name}</h2>
              <p>
                ¿QuéHago? abrirá la fuente oficial registrada y preparará una sesión de guía de 30 minutos.
                La contraseña, códigos y valores de formularios quedan en tu navegador.
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
              <dt>Dominio permitido</dt>
              <dd>{source.trustedDomains.join(", ")}</dd>
            </div>
            <div>
              <dt>Credenciales</dt>
              <dd>No se comparten</dd>
            </div>
            <div>
              <dt>Control final</dt>
              <dd>Siempre lo hacés vos</dd>
            </div>
          </dl>

          <div className="receipt-actions">
            <form action={startGuide}>
              <button className="button button-primary" type="submit">
                Resolver en sitio oficial
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {children}
    </>
  );
}

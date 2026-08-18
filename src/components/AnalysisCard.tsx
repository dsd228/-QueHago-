import Link from "next/link";
import type { AnalysisRecord } from "@/lib/types";

const categoryLabel: Record<AnalysisRecord["category"], string> = {
  pago: "Pago",
  turno: "Turno",
  tramite: "Trámite",
  mensaje: "Mensaje",
  documento: "Documento",
  seguridad: "Seguridad",
  otro: "Otro",
};

export function AnalysisCard({ item }: { item: AnalysisRecord }) {
  return (
    <Link className="analysis-card" href={`/a/${item.id}`}>
      <div className="card-topline">
        <span className="eyebrow">{categoryLabel[item.category]}</span>
        {item.isExample ? <span className="example-badge">Ejemplo</span> : null}
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <div className="card-meta">
        <span className={`priority priority-${item.priority}`}>Prioridad {item.priority}</span>
        {item.deadline ? (
          <time dateTime={item.deadline}>
            {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(item.deadline))}
          </time>
        ) : (
          <span>Sin fecha</span>
        )}
      </div>
    </Link>
  );
}

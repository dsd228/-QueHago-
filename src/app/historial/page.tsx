import { AnalysisCard } from "@/components/AnalysisCard";
import { listRecentAnalyses } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const items = listRecentAnalyses(50);
  return (
    <section className="examples-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Historial</p>
          <h1>Todo lo que pasó por ¿QuéHago?</h1>
        </div>
        <p>Análisis reales y ejemplos quedan separados por su etiqueta. Los originales nunca se envían a Make.</p>
      </div>
      <div className="card-grid">
        {items.map((item) => <AnalysisCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

import { AnalysisCard } from "@/components/AnalysisCard";
import { AnalyzerForm } from "@/components/AnalyzerForm";
import { listExampleAnalyses } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const examples = listExampleAnalyses(4);

  return (
    <div className="page-grid">
      <section className="hero-panel" aria-labelledby="home-title">
        <p className="kicker">Menos vueltas. Una acción clara.</p>
        <h1 id="home-title">¿Qué necesitás resolver?</h1>
        <p className="lead">
          Subí una captura o pegá un mensaje, una factura, un turno o un trámite. ¿QuéHago? separa qué importa y te muestra qué podés hacer ahora.
        </p>
        <AnalyzerForm />
      </section>

      <section className="examples-section" aria-labelledby="examples-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Para recorrer la experiencia</p>
            <h2 id="examples-title">Casos de ejemplo</h2>
          </div>
          <p>Son datos ficticios. Nunca se muestran como si hubieran sido analizados por IA.</p>
        </div>
        <div className="card-grid">
          {examples.map((item) => (
            <AnalysisCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

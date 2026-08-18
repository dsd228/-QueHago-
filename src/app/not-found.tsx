import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-state">
      <p className="eyebrow">No encontrado</p>
      <h1>Ese análisis no existe.</h1>
      <Link className="button button-primary" href="/">Volver al inicio</Link>
    </section>
  );
}

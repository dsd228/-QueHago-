import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="¿QuéHago? Inicio">
        <Logo />
        <span>¿QuéHago?</span>
      </Link>
      <nav className="top-nav" aria-label="Navegación principal">
        <Link href="/hoy">Hoy</Link>
        <Link href="/historial">Historial</Link>
      </nav>
    </header>
  );
}

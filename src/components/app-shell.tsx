import Link from "next/link";
import { getAiStatus } from "@/ai/provider";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  ["/hoy", "Hoy"],
  ["/cazador", "Cazador"],
  ["/entrenador", "Entrenador"],
  ["/historial", "Historial"],
  ["/perfil", "Perfil"],
] as const;
/** En escritorio cabe también la biblioteca; en móvil se llega desde Historial y desde cada misión. */
const DESKTOP_NAV = [...NAV.slice(0, 4), ["/ejercicios", "Ejercicios"], NAV[4]] as const;

export function AppShell({ current, children, reducedMotion = false }: { current: string; children: React.ReactNode; reducedMotion?: boolean }) {
  const ai = getAiStatus();
  return (
    <div className={reducedMotion ? "reduced-motion" : undefined}>
      <main id="contenido" className="shell">
        <header className="topbar">
          <Link className="brand" href="/hoy">UMBR<span>A</span>L</Link>
          <nav className="desktop-only top-nav" aria-label="Navegación principal">
            {DESKTOP_NAV.map(([href, label]) => (
              <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {ai.mode === "demo" && <span className="tag" title={ai.reason}>MODO DEMO · IA SIMULADA</span>}
            <span className="desktop-only"><SignOutButton /></span>
          </div>
        </header>
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Navegación principal (móvil)">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

import Link from "next/link";
import { requireSession } from "@/lib/session";
import { loadHunter } from "@/server/hunter";
import { getAiStatus, systemGreeting } from "@/ai/provider";
import { XpBar } from "@/components/xp-bar";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Hoy · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function HoyPage() {
  const { user } = await requireSession();
  const { profile, character, level } = await loadHunter(user.id);
  const ai = getAiStatus();
  const daysSinceJoin = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000);
  const greeting = systemGreeting({ alias: character.hunterName, level: level.level, daysSinceJoin });
  const onboarded = Boolean(profile?.onboardingCompletedAt);

  return (
    <>
      <main id="contenido" className="shell">
        <header className="topbar">
          <Link className="brand" href="/hoy">UMBR<span>A</span>L</Link>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {ai.mode === "demo" && <span className="tag" title={ai.reason}>MODO DEMO · IA SIMULADA</span>}
            <span className="desktop-only"><SignOutButton /></span>
          </div>
        </header>

        <div className="grid grid-2">
          <div className="grid">
            <section className="system-window" aria-labelledby="saludo">
              <p className="label">Sistema</p>
              <h1 id="saludo">Hoy</h1>
              <p data-testid="greeting">{greeting.text}</p>
              {greeting.origin === "template" && (
                <p className="small muted">Mensaje de plantilla del sistema, no generado por IA.</p>
              )}
            </section>

            <section className="system-window" aria-labelledby="mision">
              <p className="label">Misión principal</p>
              <h2 id="mision">{onboarded ? "Misión del día" : "Calibración pendiente"}</h2>
              {!onboarded && (
                <p>
                  Para preparar tu primera misión el sistema necesita conocer tu tiempo, tu material y tus
                  limitaciones. La calibración será conservadora y no exigirá tests máximos.
                </p>
              )}
              <div className="alert alert-info" role="note">
                <strong>En construcción:</strong> el onboarding, la misión diaria y el registro de series llegan en
                el paso 2. Esta pantalla no muestra todavía un entrenamiento real.
              </div>
              <button className="btn btn-primary btn-block" type="button" disabled>
                Empezar calibración (paso 2)
              </button>
            </section>
          </div>

          <section className="system-window" aria-labelledby="cazador" id="personaje">
            <p className="label">Cazador</p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
              <span className="rank-badge" aria-label={`Rango ${character.rank}`}>{character.rank}</span>
              <div>
                <h2 id="cazador" data-testid="hunter-name">{character.hunterName}</h2>
                <span className="small muted">Rango de cazador {character.rank}</span>
              </div>
            </div>
            <XpBar state={level} />
            <div className="stat-row">
              <div className="stat"><b data-testid="total-xp">{level.totalXp}</b><span>XP total</span></div>
              <div className="stat"><b>{level.level}</b><span>Nivel</span></div>
              <div className="stat"><b>{character.momentum}</b><span>Impulso</span></div>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              Nivel, rango e impulso son datos de juego. No miden tu salud ni tu forma física.
            </p>
          </section>
        </div>
      </main>
      <nav className="bottom-nav" aria-label="Navegación principal">
        <Link href="/hoy" aria-current="page">Hoy</Link>
        <Link href="/hoy#personaje">Cazador</Link>
        <SignOutButton className="" />
      </nav>
    </>
  );
}

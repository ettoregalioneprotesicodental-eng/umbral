import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { exerciseHistory, getProfile } from "@/server/training";
import { getExercise } from "@/domain/training/catalog";
import { AppShell } from "@/components/app-shell";

export const metadata = { title: "Historial · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function HistorialPage() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  const { sessions, sets } = await exerciseHistory(db, user.id, 60);

  // Evolución por ejercicio: solo series efectivas, agrupadas por carga y unidad (no se mezclan).
  const byExercise = new Map<string, { date: string; reps: number | null; seconds: number | null; load: string }[]>();
  for (const s of sessions) {
    for (const x of sets.filter((y) => y.sessionId === s.id && y.kind === "working")) {
      const list = byExercise.get(x.exerciseId) ?? [];
      list.push({ date: s.localDate, reps: x.reps, seconds: x.seconds, load: x.loadValue ? `${Number(x.loadValue)} ${x.loadUnit}` : "peso corporal" });
      byExercise.set(x.exerciseId, list);
    }
  }

  return (
    <AppShell current="/historial" reducedMotion={profile.reducedMotion}>
      <div className="grid" style={{ maxWidth: 900, margin: "0 auto" }}>
        <section className="system-window">
          <p className="label">Historial</p>
          <h1>Sesiones registradas</h1>
          {sessions.length === 0 ? (
            <p className="muted" data-testid="history-empty">Todavía no hay sesiones completadas. Tu primera misión aparecerá aquí.</p>
          ) : (
            <table className="log">
              <thead><tr><th>Fecha</th><th>Sesión</th><th>Series efectivas</th><th>XP</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/sesion/${s.id}`}>{s.localDate}</Link></td>
                    <td>{s.prescription.title}</td>
                    <td>{sets.filter((x) => x.sessionId === s.id && x.kind === "working").length}</td>
                    <td>{s.xpAwarded ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {byExercise.size > 0 && (
          <section className="system-window">
            <p className="label">Evolución por ejercicio</p>
            <p className="small muted">Solo se comparan series del mismo ejercicio; la carga se muestra con su unidad y no se suma entre ejercicios distintos.</p>
            {[...byExercise.entries()].map(([id, rows]) => (
              <details key={id}>
                <summary>{getExercise(id)?.name ?? id} · {new Set(rows.map((r) => r.date)).size} sesiones</summary>
                <table className="log">
                  <thead><tr><th>Fecha</th><th>Carga</th><th>Series</th></tr></thead>
                  <tbody>
                    {[...new Set(rows.map((r) => `${r.date}|${r.load}`))].map((k) => {
                      const [date, load] = k.split("|");
                      const rs = rows.filter((r) => r.date === date && r.load === load);
                      return <tr key={k}><td>{date}</td><td>{load}</td><td>{rs.map((r) => r.reps ?? `${r.seconds} s`).join(", ")}</td></tr>;
                    })}
                  </tbody>
                </table>
              </details>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

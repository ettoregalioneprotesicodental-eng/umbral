import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { checkinToInput, getCheckin, getProfile, getSession, NotFoundError, previousResults } from "@/server/training";
import { getExercise, requireExercise, WARMUP_STEPS } from "@/domain/training/catalog";
import { equipmentContext } from "@/domain/training/equipment";
import { makeAllowed } from "@/domain/training/planner";
import { formatLoad } from "@/domain/training/units";
import { AppShell } from "@/components/app-shell";
import { SessionRunner, type RunnerExercise, type RunnerSet } from "@/components/session-runner";

export const metadata = { title: "Sesión · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function SesionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  let data;
  try {
    data = await getSession(db, user.id, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { session, sets } = data;
  const p = session.prescription;

  const runnerSets: RunnerSet[] = sets.map((s) => ({
    id: s.id, slot: s.slot, exerciseId: s.exerciseId, setIndex: s.setIndex, kind: s.kind, reps: s.reps, seconds: s.seconds,
    load: s.loadValue !== null && s.loadUnit ? { value: Number(s.loadValue), unit: s.loadUnit } : null,
    rir: s.rir, discomfort: s.discomfort, note: s.note,
  }));

  if (session.status === "completed") {
    return (
      <AppShell current="/hoy" reducedMotion={profile?.reducedMotion}>
        <section className="system-window" data-testid="summary" style={{ maxWidth: 720, margin: "0 auto" }}>
          <p className="label">Resumen · {session.localDate}</p>
          <h1>Misión registrada</h1>
          <p className="reward" style={{ fontSize: "1.3rem" }}>+{session.xpAwarded ?? 0} XP</p>
          <table className="log">
            <thead><tr><th>Ejercicio</th><th>Series registradas</th></tr></thead>
            <tbody>
              {p.exercises.map((e) => {
                const rows = runnerSets.filter((s) => s.slot === e.slot);
                const usedId = rows.find((r) => r.kind !== "skipped")?.exerciseId ?? e.exerciseId;
                return (
                  <tr key={e.slot}>
                    <td>{requireExercise(usedId).name}</td>
                    <td>{rows.length === 0 ? "—" : rows.map((r) => r.kind === "skipped" ? "omitido" : `${r.reps ?? `${r.seconds} s`}${r.load ? `×${r.load.value}${r.load.unit}` : ""}${r.kind === "incomplete" ? "*" : ""}`).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">* serie incompleta. Estas cifras son lo que registraste; el plan previsto se conserva aparte.</p>
          <Link className="btn btn-primary btn-block" href="/hoy">Volver a Hoy</Link>
        </section>
      </AppShell>
    );
  }

  const eq = equipmentContext(profile?.equipment ?? []);
  const checkin = profile ? checkinToInput(await getCheckin(db, user.id, session.localDate)) : null;
  const allowed = makeAllowed({ equipment: eq, avoid: profile?.exerciseAvoid ?? [], declaredAreas: (profile?.constraints ?? []).map((c) => c.area), checkin });
  const prev = await previousResults(db, user.id, p.exercises.map((e) => e.exerciseId), session.id);

  const exercises: RunnerExercise[] = p.exercises.map((e) => {
    const ex = requireExercise(e.exerciseId);
    const altIds = [ex.easier, ex.otherEquipment].filter((x): x is string => Boolean(x) && allowed(x!));
    const pr = prev.get(e.exerciseId);
    return {
      slot: e.slot, exerciseId: ex.id, name: ex.name, unilateral: ex.unilateral, loadable: ex.loadable,
      sets: e.sets, target: e.target, load: e.load, restSeconds: e.restSeconds, rirTarget: e.rirTarget, reason: e.decision.reason,
      previous: pr ? `${pr.localDate}: ${pr.sets.filter((s) => s.kind === "working").map((s) => `${s.reps ?? `${s.seconds} s`}${s.loadValue ? ` × ${formatLoad({ value: Number(s.loadValue), unit: s.loadUnit! })}` : ""}`).join(", ")}` : null,
      alternatives: altIds.map((id) => {
        const a = getExercise(id)!;
        return { id: a.id, name: a.name, target: a.defaultTarget, loadable: a.loadable, unilateral: a.unilateral };
      }),
    };
  });

  return (
    <AppShell current="/hoy" reducedMotion={profile?.reducedMotion}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <SessionRunner
          sessionId={session.id}
          title={p.title}
          exercises={exercises}
          initialSets={runnerSets}
          loads={eq.dumbbellLoads}
          warmupSteps={p.warmup ? WARMUP_STEPS : []}
        />
      </div>
    </AppShell>
  );
}

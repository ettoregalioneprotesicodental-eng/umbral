import { and, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { getProfile } from "@/server/training";
import { listCoachMessages } from "@/ai/coach";
import { getAiStatus } from "@/ai/provider";
import { getAiConfig } from "@/ai/config";
import { usageSummary } from "@/ai/budget";
import { requireExercise } from "@/domain/training/catalog";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { askCoachAction, decideProposalAction } from "@/app/actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Entrenador · UMBRAL" };
export const dynamic = "force-dynamic";

const ORIGIN = { user: "", template: "Plantilla de demostración, no generada por IA", model: "Respuesta de Claude", unavailable: "Aviso del sistema" } as const;

export default async function EntrenadorPage() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  const ai = getAiStatus();
  const cfg = getAiConfig();
  const usage = ai.mode === "claude" ? await usageSummary(db) : null;
  const messages = await listCoachMessages(db, user.id);
  const proposalIds = messages.map((m) => m.proposalId).filter((x): x is string => Boolean(x));
  const proposals = proposalIds.length
    ? await db.select().from(schema.planProposal).where(and(eq(schema.planProposal.userId, user.id), inArray(schema.planProposal.id, proposalIds)))
    : [];
  const byId = new Map(proposals.map((p) => [p.id, p]));

  return (
    <AppShell current="/entrenador" reducedMotion={profile.reducedMotion}>
      <section className="system-window" aria-labelledby="ent" style={{ maxWidth: 760, margin: "0 auto" }}>
        <p className="label">Entrenador del Sistema</p>
        <h1 id="ent">Pregunta sobre tu misión</h1>
        {ai.mode === "demo" ? (
          <div className="alert alert-info" data-testid="ai-mode"><strong>Modo demostración.</strong>Las respuestas son plantillas fijas, sin llamadas a Claude ni coste. Los cambios que se propongan pasan por la misma validación que usará Claude.</div>
        ) : (
          <div className="alert alert-info" data-testid="ai-mode"><strong>Claude activo ({ai.model}).</strong>{ai.available ? `Gasto hoy ${usage?.dayUsd.toFixed(3)} / ${cfg.dailyBudgetUsd} USD · mes ${usage?.monthUsd.toFixed(2)} / ${cfg.monthlyBudgetUsd} USD.` : ai.reason}</div>
        )}

        <div className="chat" aria-live="polite" data-testid="chat">
          {messages.length === 0 && <p className="muted">Prueba: «¿Por qué esta misión hoy?» o «Hazla más corta».</p>}
          {messages.map((m, i) => {
            const p = m.proposalId ? byId.get(m.proposalId) : undefined;
            return (
              <div key={m.id} id={i === messages.length - 1 ? "ultimo" : undefined} className={`msg msg-${m.role}`} data-origin={m.origin}>
                {m.content}
                {m.role === "assistant" && <span className="origin">{ORIGIN[m.origin]}</span>}
                {p && (
                  <div className="system-window" style={{ marginTop: 8, padding: 10 }} data-testid="proposal">
                    <p className="label">Propuesta de cambio · {p.status === "pending" ? "pendiente" : p.status === "applied" ? "aplicada" : p.status === "rejected" ? "descartada" : "caducada"}</p>
                    <ul className="small">{p.proposal.exercises.map((e) => <li key={e.slot}>{requireExercise(e.exerciseId).name}: {e.sets} series</li>)}</ul>
                    <p className="small">≈ {p.proposal.estimatedMinutes} min · validada por las reglas del plan</p>
                    {p.status === "pending" && (
                      <form action={decideProposalAction} className="row">
                        <input type="hidden" name="proposalId" value={p.id} />
                        <SubmitButton name="decision" value="apply" pendingText="Aplicando…">Aplicar a mi misión</SubmitButton>
                        <SubmitButton name="decision" value="reject" className="btn btn-block" pendingText="…">Descartar</SubmitButton>
                      </form>
                    )}
                    {p.status === "stale" && <p className="small muted">La misión cambió o ya empezó; esta propuesta ya no se puede aplicar.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form action={askCoachAction} className="chat-form grid" style={{ marginTop: 14 }}>
          <label htmlFor="question" className="field-label">Tu pregunta</label>
          <textarea id="question" name="question" maxLength={1000} required placeholder="¿Por qué esta misión hoy?" />
          <SubmitButton pendingText="Pensando…">Enviar</SubmitButton>
        </form>
        <p className="small muted" style={{ marginTop: 10 }}>El entrenador explica y propone; el plan lo calculan reglas comprobables y nada cambia sin tu confirmación. No sustituye a un profesional sanitario.</p>
      </section>
    </AppShell>
  );
}

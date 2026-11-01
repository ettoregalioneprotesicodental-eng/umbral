import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getExercise } from "@/domain/training/catalog";
import { formatTarget } from "@/domain/training/units";
import { AppShell } from "@/components/app-shell";

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const e = getExercise(id);
  if (!e) notFound();
  const link = (rid?: string) => { const r = rid ? getExercise(rid) : undefined; return r ? <Link href={`/ejercicios/${r.id}`}>{r.name}</Link> : "—"; };
  return (
    <AppShell current="/ejercicios">
      <article className="system-window" style={{ maxWidth: 720, margin: "0 auto" }}>
        <p className="label">Ficha · {e.id}</p>
        <h1>{e.name}</h1>
        <p className="muted">{e.variant}</p>
        <p><strong>Objetivo:</strong> {e.goal}</p>
        <p className="small"><strong>Zonas:</strong> {e.zones.join(", ")} · <strong>Espacio:</strong> {e.space} · <strong>Nivel:</strong> {e.skill === "basic" ? "básico" : "intermedio"}</p>
        <p className="small"><strong>Prescripción habitual:</strong> {formatTarget(e.defaultTarget)}{e.unilateral ? " por lado" : ""}</p>
        <h2>Preparación</h2>
        <ol>{e.setup.map((s) => <li key={s}>{s}</li>)}</ol>
        <h2>Ejecución</h2>
        <ol>{e.execution.map((s) => <li key={s}>{s}</li>)}</ol>
        <p><strong>Respiración:</strong> {e.breathing}</p>
        <h2>Errores frecuentes</h2>
        <ul>{e.commonErrors.map((s) => <li key={s}>{s}</li>)}</ul>
        <h2>Cuándo parar o adaptar</h2>
        <ul>{e.stopSignals.map((s) => <li key={s}>{s}</li>)}</ul>
        <h2>Alternativas</h2>
        <p className="small">Más fácil: {link(e.easier)} · Más difícil: {link(e.harder)} · Otro material: {link(e.otherEquipment)}</p>
        <h2>Recurso visual</h2>
        <p className="small muted">Sin recurso visual verificado todavía. Sigue las instrucciones escritas.</p>
        <h2>Fuentes y revisión</h2>
        <ul className="small">
          {e.sources.map((s) => (
            <li key={s.title}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title} — {s.publisher}. Consultada: {s.consultedAt}. {s.supports} {s.verified ? "" : "(pendiente de verificar)"}</li>
          ))}
        </ul>
        <p className="small muted">Estado: revisión editorial interna ({e.reviewedAt}). No sustituye la revisión de un profesional cualificado.</p>
      </article>
    </AppShell>
  );
}

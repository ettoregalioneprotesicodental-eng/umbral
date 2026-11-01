import Link from "next/link";
import { requireSession } from "@/lib/session";
import { EXERCISES } from "@/domain/training/catalog";
import { formatTarget } from "@/domain/training/units";
import { AppShell } from "@/components/app-shell";

export const metadata = { title: "Ejercicios · UMBRAL" };

const PATTERN: Record<string, string> = {
  squat: "Sentadilla", lunge: "Zancada", hinge: "Bisagra de cadera", push_horizontal: "Empuje horizontal", push_vertical: "Empuje vertical",
  pull_horizontal: "Tracción", core_anti_extension: "Tronco", core_anti_rotation: "Tronco", core_lateral: "Tronco lateral",
  carry: "Transporte", calf: "Gemelos", mobility: "Movilidad", conditioning: "Recuperación activa",
};

export default async function EjerciciosPage() {
  await requireSession();
  return (
    <AppShell current="/ejercicios">
      <div className="grid" style={{ maxWidth: 900, margin: "0 auto" }}>
        <section className="system-window">
          <p className="label">Biblioteca</p>
          <h1>Ejercicios</h1>
          <p className="small muted">{EXERCISES.length} fichas con instrucciones escritas. Revisión editorial interna: todavía sin revisión de un profesional cualificado. No hay vídeos porque aún no hay recursos visuales verificados con licencia.</p>
        </section>
        <ul className="ex-list">
          {EXERCISES.map((e) => (
            <li key={e.id}>
              <div className="ex-name"><Link href={`/ejercicios/${e.id}`}>{e.name}</Link></div>
              <div className="small muted">{PATTERN[e.pattern]} · {formatTarget(e.defaultTarget)} · {e.equipment.filter((x) => x !== "none").map((x) => ({ dumbbell: "mancuernas", mat: "esterilla", wall: "apoyo estable" } as Record<string, string>)[x]).join(", ") || "sin material"}</div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

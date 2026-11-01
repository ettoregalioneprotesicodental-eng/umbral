import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { loadHunter } from "@/server/hunter";
import { ensureTodayMission, getCheckin, getProfile, todayFor } from "@/server/training";
import { ensureEncounter, processMissedMissions } from "@/server/game";
import { getBoss } from "@/domain/game/content";
import { systemGreeting } from "@/ai/provider";
import { requireExercise } from "@/domain/training/catalog";
import { AREA_LABELS } from "@/domain/training/planner";
import { RED_FLAGS, safetyMessage } from "@/domain/training/safety";
import { formatLoad, formatTarget } from "@/domain/training/units";
import { GAME_RULES_V1 } from "@/domain/game/rules";
import { XpBar } from "@/components/xp-bar";
import { AppShell } from "@/components/app-shell";
import { CheckinForm } from "@/components/checkin-form";
import { confirmRestAction, postponeAction, shortModeAction, startMissionAction } from "@/app/actions";

export const metadata = { title: "Hoy · UMBRAL" };
export const dynamic = "force-dynamic";

const areaList = Object.entries(AREA_LABELS).map(([id, label]) => ({ id, label }));

export default async function HoyPage() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  const { character, level } = await loadHunter(user.id);
  const daysSinceJoin = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000);
  const onboarded = Boolean(profile?.onboardingCompletedAt);
  const greeting = systemGreeting({ alias: character.hunterName, level: level.level, daysSinceJoin, onboarded });

  let missionSection: React.ReactNode;
  if (!profile || !onboarded) {
    missionSection = (
      <section className="system-window" aria-labelledby="mision">
        <p className="label">Misión principal</p>
        <h2 id="mision">Calibración pendiente</h2>
        <p>Para preparar tu primera misión el sistema necesita conocer tu tiempo, tu material y tus limitaciones. Es conservadora y no exige tests máximos.</p>
        <Link className="btn btn-primary btn-block" href="/onboarding">Empezar calibración</Link>
      </section>
    );
  } else {
    // Antes de preparar hoy, se cierran las misiones vencidas (con margen de un día y sin castigo si está desactivado).
    await processMissedMissions(db, profile, todayFor(profile));
    const mission = await ensureTodayMission(db, profile);
    const encounter = await ensureEncounter(db, user.id);
    const boss = getBoss(encounter.bossId);
    const checkin = await getCheckin(db, user.id, mission.localDate);
    const p = mission.prescription;
    const [ws] = await db.select({ id: schema.workoutSession.id, xp: schema.workoutSession.xpAwarded }).from(schema.workoutSession).where(eq(schema.workoutSession.plannedSessionId, mission.id));

    missionSection = (
      <>
        {checkin?.discomfort === "red_flag" && (
          <div className={`alert ${safetyMessage(checkin.redFlags).urgent ? "alert-error" : "alert-info"}`} role="alert" data-testid="safety">
            <strong>Atención:</strong>{safetyMessage(checkin.redFlags).text}
          </div>
        )}

        {mission.status === "planned" && !checkin && p.kind !== "rest" && (
          <section className="system-window" aria-labelledby="checkin-title">
            <p className="label">Chequeo diario · 20 segundos</p>
            <h2 id="checkin-title">¿Cómo llegas hoy?</h2>
            <CheckinForm defaultMinutes={profile.minutesPerSession ?? 20} areas={areaList} redFlags={RED_FLAGS} />
          </section>
        )}

        <section className="system-window" aria-labelledby="mision" data-testid="mission">
          <p className="label">Misión principal · {mission.localDate}</p>
          <h2 id="mision">{p.title}</h2>

          {mission.status === "planned" && p.exercises.length > 0 && (
            <>
              <p data-testid="mission-duration"><strong>≈ {p.estimatedMinutes} min</strong> <span className="muted">de {p.budgetMinutes} disponibles, con calentamiento y descansos incluidos{p.shortMode ? " · versión corta" : ""}.</span></p>
              <ul className="ex-list" aria-label="Ejercicios de hoy">
                {p.exercises.map((e) => {
                  const ex = requireExercise(e.exerciseId);
                  return (
                    <li key={e.slot}>
                      <div className="ex-name"><Link href={`/ejercicios/${ex.id}`}>{ex.name}</Link></div>
                      <div className="small">{e.sets} × {formatTarget(e.target)}{ex.unilateral ? " por lado" : ""} · {formatLoad(e.load)} · descanso {e.restSeconds} s</div>
                      <div className="small muted">{e.decision.reason}</div>
                    </li>
                  );
                })}
              </ul>
              {p.reasons.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary>Por qué esta misión hoy</summary>
                  <ul className="small">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </details>
              )}
              <p className="reward" style={{ marginTop: 10 }}>Recompensa: hasta {GAME_RULES_V1.xp.dailyMissionMax} XP · parcial proporcional a las series hechas</p>
              <div className="grid" style={{ gap: 8 }}>
                <form action={startMissionAction}>
                  <input type="hidden" name="missionId" value={mission.id} />
                  <button className="btn btn-primary btn-block" type="submit">Empezar misión</button>
                </form>
                <div className="row">
                  <form action={shortModeAction}>
                    <input type="hidden" name="short" value={p.shortMode ? "0" : "1"} />
                    <button className="btn btn-block" type="submit">{p.shortMode ? "Versión normal" : "Versión corta"}</button>
                  </form>
                  <form action={postponeAction}>
                    <input type="hidden" name="missionId" value={mission.id} />
                    <button className="btn btn-block" type="submit">Hoy no puedo</button>
                  </form>
                </div>
              </div>
            </>
          )}

          {mission.status === "planned" && p.exercises.length === 0 && (
            <>
              {p.reasons.map((r) => <p key={r}>{r}</p>)}
              <p className="reward">Recompensa: {GAME_RULES_V1.xp.dailyMissionMax} XP por respetar el descanso</p>
              <form action={confirmRestAction}>
                <input type="hidden" name="missionId" value={mission.id} />
                <button className="btn btn-primary btn-block" type="submit">Confirmar descanso</button>
              </form>
            </>
          )}

          {mission.status === "in_progress" && ws && (
            <Link className="btn btn-primary btn-block" href={`/sesion/${ws.id}`}>Continuar sesión</Link>
          )}
          {(mission.status === "completed" || mission.status === "partial") && (
            <p data-testid="mission-done">
              {mission.status === "completed" ? "Misión cumplida." : "Misión completada en parte."}{" "}
              {ws?.xp != null ? <span className="reward">+{ws.xp} XP</span> : p.kind === "rest" ? <span className="reward">+{GAME_RULES_V1.xp.dailyMissionMax} XP</span> : null}
              {ws && <> · <Link href={`/sesion/${ws.id}`}>Ver resumen</Link></>}
            </p>
          )}
          {mission.status === "postponed" && (
            <p>Misión pospuesta. Sin penalización: mañana el portal se abrirá con tu siguiente misión, sin acumular la de hoy.</p>
          )}
          {mission.status === "exempt" && (
            <p>Misión exenta por seguridad. No cuenta como omisión ni genera penalización.</p>
          )}

          {encounter.status === "active" && (
            <p className="small" data-testid="boss-hint" style={{ marginTop: 10 }}>
              <Link href="/cazador">{boss.name}</Link>: {encounter.sealsBroken} de {encounter.seals} sellos rotos. {p.kind !== "rest" && mission.status === "planned" ? "Completar esta misión rompe uno." : ""}
            </p>
          )}

          {mission.status === "planned" && checkin && p.kind !== "rest" && (
            <details style={{ marginTop: 10 }}>
              <summary>Repetir chequeo</summary>
              <CheckinForm defaultMinutes={profile.minutesPerSession ?? 20} areas={areaList} redFlags={RED_FLAGS} initial={checkin} />
            </details>
          )}
        </section>
      </>
    );
  }

  return (
    <AppShell current="/hoy" reducedMotion={profile?.reducedMotion}>
      <div className="grid grid-2">
        <div className="grid">
          <section className="system-window" aria-labelledby="saludo">
            <p className="label">Sistema</p>
            <h1 id="saludo">Hoy</h1>
            <p data-testid="greeting">{greeting.text}</p>
            {greeting.origin === "template" && <p className="small muted">Mensaje de plantilla del sistema, no generado por IA.</p>}
          </section>
          {missionSection}
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
          <p className="small muted" style={{ marginTop: 12 }}>Nivel, rango e impulso son datos de juego. No miden tu salud ni tu forma física.</p>
        </section>
      </div>
    </AppShell>
  );
}

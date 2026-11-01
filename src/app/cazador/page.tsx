import Link from "next/link";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { loadHunter } from "@/server/hunter";
import { loadCampaign } from "@/server/game";
import { ITEMS, RANK_D_REQUIREMENT, getItem, type ItemSlot } from "@/domain/game/content";
import { AppShell } from "@/components/app-shell";
import { HunterAvatar } from "@/components/hunter-avatar";
import { XpBar } from "@/components/xp-bar";
import { revertPenaltyAction } from "@/app/actions";

export const metadata = { title: "Cazador · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function CazadorPage() {
  const { user } = await requireSession();
  const { profile, character, level } = await loadHunter(user.id);
  const onboarded = Boolean(profile?.onboardingCompletedAt);
  const c = await loadCampaign(db, user.id, onboarded);
  const equipped: Partial<Record<ItemSlot, string>> = {};
  for (const i of c.items) if (i.equipped) { const d = getItem(i.itemId); if (d) equipped[d.slot] = d.id; }
  const owned = new Set(c.items.map((i) => i.itemId));
  const nextItems = ITEMS.filter((i) => !owned.has(i.id));

  return (
    <AppShell current="/cazador" reducedMotion={profile?.reducedMotion}>
      <div className="grid grid-2">
        <div className="grid">
          <section className="system-window" aria-labelledby="cz">
            <p className="label">Cazador · rango {character.rank}</p>
            <h1 id="cz">{character.hunterName}</h1>
            <HunterAvatar equipped={equipped} rank={character.rank} reducedMotion={profile?.reducedMotion} />
            <XpBar state={level} />
            <div className="stat-row">
              <div className="stat"><b>{level.level}</b><span>Nivel</span></div>
              <div className="stat"><b>{character.rank}</b><span>Rango</span></div>
              <div className="stat"><b data-testid="momentum">{character.momentum}</b><span>Impulso</span></div>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>Rango D: derrota al Guardián y completa {RANK_D_REQUIREMENT.validMissions} misiones (los descansos planificados cuentan). El impulso nunca baja de 70 ni quita nivel, XP u objetos.</p>
          </section>

          {c.boss && c.encounter && (
            <section className="system-window" aria-labelledby="jefe" data-testid="boss">
              <p className="label">Jefe · {c.boss.archetype}</p>
              <h2 id="jefe">{c.boss.name}</h2>
              <div className="seals" aria-label={`${c.encounter.sealsBroken} de ${c.encounter.seals} sellos rotos`}>
                {Array.from({ length: c.encounter.seals }, (_, i) => (
                  <span key={i} className={`seal${i < c.encounter!.sealsBroken ? " broken" : ""}`} aria-hidden="true">{i + 1}</span>
                ))}
              </div>
              <p data-testid="boss-status">{c.encounter.status === "defeated" ? "Derrotado." : `${c.encounter.sealsBroken} de ${c.encounter.seals} sellos rotos.`}</p>
              <p className="small">{c.encounter.status === "defeated" ? c.boss.victory : c.boss.intro}</p>
              <p className="small muted">{c.boss.requirement}</p>
              <p className="reward">Recompensa: {c.boss.rewardXp} XP, {c.boss.rewardItems.map((i) => getItem(i)?.name).join(" y ")}</p>
            </section>
          )}
          {!onboarded && (
            <section className="system-window"><p>Completa la <Link href="/onboarding">calibración</Link> para abrir tu primera mazmorra.</p></section>
          )}
        </div>

        <div className="grid">
          <section className="system-window" aria-labelledby="inv">
            <p className="label">Inventario</p>
            <h2 id="inv">Objetos</h2>
            {c.items.length === 0 ? <p className="muted">Aún sin objetos. El primero llega en el nivel 3.</p> : (
              <ul className="item-list" data-testid="inventory">
                {c.items.map((i) => { const d = getItem(i.itemId)!; return <li key={i.itemId}><strong>{d.name}</strong>{i.equipped ? " · equipado" : ""}<div className="small muted">{d.description}</div></li>; })}
              </ul>
            )}
            {nextItems.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary>Por desbloquear</summary>
                <ul className="small">{nextItems.map((i) => <li key={i.id}>{i.name}: {i.unlockLevel ? `nivel ${i.unlockLevel}` : "jefe Guardián del Umbral"}</li>)}</ul>
              </details>
            )}
          </section>

          <section className="system-window" aria-labelledby="cron">
            <p className="label">Crónica</p>
            <h2 id="cron">Lo que ha pasado</h2>
            {c.facts.length === 0 ? <p className="muted">La crónica empieza tras la calibración.</p> : (
              <ol className="chronicle" data-testid="chronicle">{c.facts.map((f) => <li key={f.id}>{f.text}</li>)}</ol>
            )}
            <p className="small muted">Textos de plantilla escritos para UMBRAL. La historia solo refleja hechos registrados.</p>
          </section>

          {c.penalties.length > 0 && (
            <section className="system-window" aria-labelledby="imp">
              <p className="label">Impulso</p>
              <h2 id="imp">Misiones omitidas</h2>
              <ul className="item-list" data-testid="penalties">
                {c.penalties.map((p) => (
                  <li key={p.id}>
                    {p.localDate}: {p.delta === 0 ? "sin efecto (límite semanal o suelo)" : `${p.delta} impulso`}
                    {p.reverted ? " · revertida" : p.delta < 0 && (
                      <form action={revertPenaltyAction} style={{ marginTop: 6 }}>
                        <input type="hidden" name="eventId" value={p.id} />
                        <button className="btn" type="submit">Fue enfermedad, viaje o un fallo: revertir</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

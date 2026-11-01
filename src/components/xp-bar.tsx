import type { LevelState } from "@/domain/game/xp";

export function XpBar({ state }: { state: LevelState }) {
  const pct = Math.round((state.xpIntoLevel / state.xpForThisLevel) * 100);
  return (
    <div className="xp">
      <div className="xp-head">
        <span>Nivel {state.level}</span>
        <span>{state.xpIntoLevel} / {state.xpForThisLevel} XP</span>
      </div>
      <div
        className="xp-track"
        role="progressbar"
        aria-label={`Experiencia del nivel ${state.level}`}
        aria-valuemin={0}
        aria-valuemax={state.xpForThisLevel}
        aria-valuenow={state.xpIntoLevel}
        aria-valuetext={`${state.xpIntoLevel} de ${state.xpForThisLevel} XP; faltan ${state.xpRemaining}`}
      >
        <div className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">Faltan {state.xpRemaining} XP para el nivel {state.level + 1}.</span>
    </div>
  );
}

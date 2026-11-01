/**
 * Temporizador de descanso basado en marcas de tiempo (AC22). No depende de que el navegador
 * ejecute un contador cada segundo: el estado se recalcula desde `endsAt` al volver.
 */
export type TimerState =
  | { status: "idle" }
  | { status: "running"; endsAt: number; durationMs: number }
  | { status: "paused"; remainingMs: number; durationMs: number };

export function startTimer(now: number, seconds: number): TimerState {
  const durationMs = Math.max(0, Math.round(seconds * 1000));
  return { status: "running", endsAt: now + durationMs, durationMs };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === "idle") return 0;
  if (state.status === "paused") return state.remainingMs;
  return Math.max(0, state.endsAt - now);
}

export function isFinished(state: TimerState, now: number): boolean {
  return state.status === "running" && now >= state.endsAt;
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.status !== "running") return state;
  return { status: "paused", remainingMs: remainingMs(state, now), durationMs: state.durationMs };
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  if (state.status !== "paused") return state;
  return { status: "running", endsAt: now + state.remainingMs, durationMs: state.durationMs };
}

export function adjustTimer(state: TimerState, deltaSeconds: number, now: number): TimerState {
  const d = deltaSeconds * 1000;
  if (state.status === "running") {
    const endsAt = Math.max(now, state.endsAt + d);
    return { ...state, endsAt, durationMs: Math.max(0, state.durationMs + d) };
  }
  if (state.status === "paused") return { ...state, remainingMs: Math.max(0, state.remainingMs + d) };
  return state;
}

/** Serializa/deserializa sin confiar en datos corruptos de almacenamiento local. */
export function parseTimer(raw: unknown): TimerState {
  if (!raw || typeof raw !== "object") return { status: "idle" };
  const r = raw as Record<string, unknown>;
  if (r.status === "running" && typeof r.endsAt === "number" && typeof r.durationMs === "number") {
    return { status: "running", endsAt: r.endsAt, durationMs: r.durationMs };
  }
  if (r.status === "paused" && typeof r.remainingMs === "number" && typeof r.durationMs === "number") {
    return { status: "paused", remainingMs: r.remainingMs, durationMs: r.durationMs };
  }
  return { status: "idle" };
}

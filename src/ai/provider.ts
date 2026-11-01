/**
 * Capa de IA sustituible. La aplicación funciona entera sin ella: el plan, el registro
 * y las recompensas se calculan con código. Claude solo explica, propone y redacta.
 */
export type AiMode = "demo" | "claude";

export interface AiStatus {
  mode: AiMode;
  /** true solo si hay modo claude, clave en el servidor y modelo configurado. */
  available: boolean;
  reason?: string;
}

export function getAiStatus(): AiStatus {
  const mode: AiMode = process.env.AI_MODE === "claude" ? "claude" : "demo";
  if (mode === "demo") {
    return { mode, available: false, reason: "Modo demostración: sin llamadas a la API ni coste." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { mode, available: false, reason: "Falta ANTHROPIC_API_KEY en los secretos del servidor." };
  }
  if (!process.env.CLAUDE_MODEL) {
    return { mode, available: false, reason: "Falta CLAUDE_MODEL en la configuración del servidor." };
  }
  return { mode, available: true };
}

export interface GreetingContext {
  alias: string;
  level: number;
  /** Días con cuenta. Solo datos reales; nunca inventar logros. */
  daysSinceJoin: number;
}

export interface GeneratedText {
  text: string;
  /** "template" = plantilla fija identificada, nunca presentada como respuesta nueva del modelo. */
  origin: "template" | "model";
}

/** Saludo del sistema. En esta fase siempre es una plantilla identificada. */
export function systemGreeting(ctx: GreetingContext): GeneratedText {
  const text =
    ctx.daysSinceJoin === 0
      ? `Sistema: despertar confirmado, ${ctx.alias}. Tu portal se abrirá cuando completes la calibración.`
      : `Sistema: el portal sigue aquí, ${ctx.alias}. Nivel ${ctx.level}. Reanudaremos desde tu capacidad actual.`;
  return { text, origin: "template" };
}

/**
 * Capa de IA sustituible. La aplicación funciona entera sin ella: el plan, el registro
 * y las recompensas se calculan con código. Claude solo explica, propone y redacta.
 */
import { getAiConfig, type AiMode } from "./config";
export type { AiMode } from "./config";

export interface AiStatus {
  mode: AiMode;
  /** true solo si hay modo claude y clave en el servidor. */
  available: boolean;
  model?: string;
  reason?: string;
}

export function getAiStatus(): AiStatus {
  const c = getAiConfig();
  if (c.mode === "demo") {
    return { mode: c.mode, available: false, reason: "Modo demostración: respuestas de plantilla, sin llamadas a la API ni coste." };
  }
  if (!c.hasKey) {
    return { mode: c.mode, available: false, reason: "Falta ANTHROPIC_API_KEY en los secretos del servidor." };
  }
  return { mode: c.mode, available: true, model: c.model };
}

export interface GreetingContext {
  alias: string;
  level: number;
  /** Días con cuenta. Solo datos reales; nunca inventar logros. */
  daysSinceJoin: number;
  onboarded?: boolean;
}

export interface GeneratedText {
  text: string;
  /** "template" = plantilla fija identificada, nunca presentada como respuesta nueva del modelo. */
  origin: "template" | "model";
}

/** Saludo del sistema. Siempre es una plantilla identificada (no gasta IA en cada visita). */
export function systemGreeting(ctx: GreetingContext): GeneratedText {
  const text = !ctx.onboarded
    ? `Sistema: despertar confirmado, ${ctx.alias}. Tu portal se abrirá cuando completes la calibración.`
    : ctx.daysSinceJoin === 0
      ? `Sistema: calibración registrada, ${ctx.alias}. El portal está preparado y la misión está ajustada a tu tiempo.`
      : `Sistema: el portal sigue aquí, ${ctx.alias}. Nivel ${ctx.level}. Reanudaremos desde tu capacidad actual.`;
  return { text, origin: "template" };
}

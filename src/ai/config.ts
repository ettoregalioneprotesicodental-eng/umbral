/**
 * Configuración de la IA, leída solo en el servidor. Ningún valor aquí es secreto salvo
 * la presencia de la clave, que nunca se devuelve.
 */
export type AiMode = "demo" | "claude";

/** Precio en USD por millón de tokens (entrada, salida). Revisar en la web de Anthropic antes de activar. */
export const AI_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
/** Para modelos sin precio conocido se usa el más caro, de modo que el presupuesto nunca se queda corto. */
const FALLBACK_PRICE = { input: 4, output: 20 };

export interface AiConfig {
  mode: AiMode;
  model: string;
  hasKey: boolean;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxIterations: number;
  maxOutputTokens: number;
  /** Tokens de entrada estimados por iteración para la reserva previa. */
  inputTokensPerIteration: number;
  maxConcurrentPerUser: number;
}

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    mode: env.AI_MODE === "claude" ? "claude" : "demo",
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
    hasKey: Boolean(env.ANTHROPIC_API_KEY),
    dailyBudgetUsd: num(env.AI_DAILY_BUDGET_USD, 0.5),
    monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 5),
    maxIterations: 3,
    maxOutputTokens: 1500,
    inputTokensPerIteration: 6000,
    maxConcurrentPerUser: 1,
  };
}

export function priceFor(model: string) {
  return AI_PRICING[model] ?? FALLBACK_PRICE;
}

/** Coste en microdólares (enteros) para no acumular errores de coma flotante. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return Math.ceil(inputTokens * p.input + outputTokens * p.output);
}

/** Peor caso de una ejecución completa: lo que se reserva ANTES de llamar (AC23). */
export function worstCaseMicroUsd(c: AiConfig): number {
  return costMicroUsd(c.model, c.inputTokensPerIteration * c.maxIterations, c.maxOutputTokens * c.maxIterations);
}

/**
 * Señales que interrumpen cualquier recomendación de esfuerzo. No es un diagnóstico.
 */
export const RED_FLAGS = [
  { id: "chest_pain", label: "Dolor u opresión en el pecho" },
  { id: "fainting", label: "Desmayo o mareo intenso" },
  { id: "breathless", label: "Falta de aire inusual en reposo o con poco esfuerzo" },
  { id: "acute_pain", label: "Dolor agudo e intenso tras un golpe, caída o gesto" },
  { id: "neuro", label: "Pérdida de fuerza en una pierna, hormigueo en la zona genital o problemas para controlar la orina o las heces" },
] as const;

export type RedFlagId = (typeof RED_FLAGS)[number]["id"];

export const URGENT_FLAGS: ReadonlySet<string> = new Set(["chest_pain", "fainting", "breathless", "neuro"]);

export function safetyMessage(flags: string[]): { urgent: boolean; text: string } {
  const urgent = flags.some((f) => URGENT_FLAGS.has(f));
  return urgent
    ? {
        urgent,
        text: "Detén cualquier esfuerzo. Estos síntomas pueden requerir atención urgente: llama al 112 (o al número de emergencias de tu país) o acude a urgencias.",
      }
    : {
        urgent,
        text: "Hoy no se propone entrenamiento. Si el dolor es intenso o no mejora, consulta con un profesional sanitario. La misión queda exenta, sin penalización.",
      };
}

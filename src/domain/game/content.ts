/**
 * Contenido original del primer arco. Textos de plantilla escritos para UMBRAL:
 * no copian obras existentes. La narrativa solo REACCIONA a hechos del servidor;
 * nunca concede objetos, XP ni récords (AC18).
 */

export type ItemSlot = "cape" | "aura" | "armor" | "weapon" | "companion";

export interface ItemDef {
  id: string;
  name: string;
  slot: ItemSlot;
  description: string;
  /** Nivel que lo desbloquea; null si procede de un jefe. */
  unlockLevel: number | null;
  bossId: string | null;
}

export const ITEMS: ItemDef[] = [
  { id: "capa_umbral", name: "Capa del Umbral", slot: "cape", unlockLevel: 3, bossId: null, description: "Tela gris que se oscurece con cada misión cumplida." },
  { id: "aura_azul", name: "Aura azul", slot: "aura", unlockLevel: 5, bossId: null, description: "Un brillo frío alrededor del cazador. Solo estético." },
  { id: "aura_violeta", name: "Aura violeta", slot: "aura", unlockLevel: 10, bossId: null, description: "El brillo se vuelve más denso. Solo estético." },
  { id: "armadura_cazador", name: "Armadura de cazador", slot: "armor", unlockLevel: 15, bossId: null, description: "Placas ligeras de una mazmorra superada." },
  { id: "daga_guardian", name: "Daga del Guardián", slot: "weapon", unlockLevel: null, bossId: "guardian_umbral", description: "Fragmento del tercer sello, convertido en hoja." },
  { id: "sombra_companera", name: "Sombra compañera", slot: "companion", unlockLevel: null, bossId: "guardian_umbral", description: "Una silueta que te sigue a distancia. Recuerda tus sesiones." },
];

export function getItem(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export interface BossDef {
  id: string;
  name: string;
  archetype: string;
  seals: number;
  /** Requisito: misiones PLANIFICADAS válidas (entrenamiento o movilidad). Nunca volumen extra (AC13). */
  requirement: string;
  rewardXp: number;
  rewardItems: string[];
  intro: string;
  sealLines: string[];
  victory: string;
}

export const BOSSES: BossDef[] = [
  {
    id: "guardian_umbral",
    name: "Guardián del Umbral",
    archetype: "Constancia",
    seals: 3,
    requirement: "Cada misión planificada de entrenamiento o movilidad que completes rompe un sello. No hay trabajo extra: el jefe se derrota con tu plan normal.",
    rewardXp: 150,
    rewardItems: ["daga_guardian", "sombra_companera"],
    intro: "Una figura de piedra bloquea la salida de la primera mazmorra. Tres sellos brillan en su pecho. No responde a la fuerza bruta: solo a la constancia.",
    sealLines: [
      "El primer sello se agrieta. El Guardián gira la cabeza hacia ti por primera vez.",
      "El segundo sello cae. La piedra cruje; ya no estás de paso, estás volviendo.",
      "El tercer sello se rompe. El Guardián se arrodilla y la salida se abre.",
    ],
    victory: "El Guardián del Umbral se disuelve en polvo gris. Entre los restos quedan una daga y una sombra que decide seguirte.",
  },
];

export function getBoss(id: string): BossDef {
  const b = BOSSES.find((x) => x.id === id);
  if (!b) throw new Error(`Jefe desconocido: ${id}`);
  return b;
}

export const FIRST_BOSS_ID = "guardian_umbral";

export const STORY = {
  prologue: "Prólogo. Un portal se abrió en tu cuarto sin hacer ruido. El Sistema no promete poder: promete un camino corto cada día que puedas recorrer.",
  chapter1: "Capítulo 1 · La primera mazmorra. Tu cuerpo recuerda más de lo que crees. El Sistema empieza por debajo de tu capacidad para que vuelvas sin romperte.",
  rankD: "El Sistema actualiza tu licencia: rango D. No por un gran esfuerzo, sino por haber vuelto una y otra vez.",
} as const;

/** Rango D: jefe derrotado y al menos 12 misiones válidas (incluye descansos planificados cumplidos). */
export const RANK_D_REQUIREMENT = { bossId: FIRST_BOSS_ID, validMissions: 12 } as const;

/** Objetos que corresponden a un nivel. Se conceden de forma idempotente al subir. */
export function itemsUnlockedAtOrBelow(level: number): ItemDef[] {
  return ITEMS.filter((i) => i.unlockLevel !== null && i.unlockLevel <= level);
}

/** Lunes (ISO) de la semana de una fecha local AAAA-MM-DD. */
export function weekStartOf(local: string): string {
  const [y, m, d] = local.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  const wd = new Date(t).getUTCDay() || 7;
  return new Date(t - (wd - 1) * 86_400_000).toISOString().slice(0, 10);
}

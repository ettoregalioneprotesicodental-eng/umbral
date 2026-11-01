import type { ItemSlot } from "@/domain/game/content";

/**
 * Avatar vectorial original. Los objetos equipados solo cambian la apariencia.
 * Respeta «reducir animaciones» y prefers-reduced-motion (sin pulso del aura).
 */
export function HunterAvatar({ equipped, rank, reducedMotion }: { equipped: Partial<Record<ItemSlot, string>>; rank: string; reducedMotion?: boolean }) {
  const aura = equipped.aura === "aura_violeta" ? "#a77bff" : equipped.aura === "aura_azul" ? "#5aa9ff" : null;
  const desc = [
    `Cazador de rango ${rank}`,
    equipped.cape && "con capa",
    aura && (equipped.aura === "aura_violeta" ? "aura violeta" : "aura azul"),
    equipped.armor && "armadura",
    equipped.weapon && "daga",
    equipped.companion && "una sombra compañera",
  ].filter(Boolean).join(", ");
  return (
    <svg viewBox="0 0 200 240" role="img" aria-label={desc} className="avatar" data-testid="avatar" width="200" height="240">
      <defs>
        <radialGradient id="auraG" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor={aura ?? "#000"} stopOpacity={aura ? 0.55 : 0} />
          <stop offset="100%" stopColor={aura ?? "#000"} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a3150" />
          <stop offset="100%" stopColor="#141829" />
        </linearGradient>
      </defs>
      {aura && <ellipse cx="100" cy="130" rx="92" ry="110" fill="url(#auraG)" className={reducedMotion ? undefined : "aura-pulse"} />}
      {equipped.companion && (
        <g opacity="0.55" data-item="sombra_companera">
          <circle cx="168" cy="150" r="11" fill="#0b0d18" />
          <path d="M156 220 L160 168 Q168 158 176 168 L180 220 Z" fill="#0b0d18" />
          <circle cx="165" cy="149" r="1.6" fill="#a77bff" /><circle cx="171" cy="149" r="1.6" fill="#a77bff" />
        </g>
      )}
      {equipped.cape && <path data-item="capa_umbral" d="M70 78 Q100 70 130 78 L150 220 Q100 232 50 220 Z" fill="#3b3f52" />}
      {/* Cuerpo */}
      <circle cx="100" cy="50" r="22" fill="#d9c3a5" />
      <path d="M78 42 Q100 18 122 42 Q118 30 100 28 Q82 30 78 42 Z" fill="#1a1d2b" />
      <path d="M72 80 Q100 70 128 80 L134 150 L66 150 Z" fill="url(#bodyG)" />
      {equipped.armor && <path data-item="armadura_cazador" d="M76 84 Q100 76 124 84 L126 120 Q100 130 74 120 Z" fill="#6f7aa8" stroke="#c9d1ff" strokeWidth="1.5" />}
      <rect x="56" y="82" width="14" height="60" rx="7" fill="#2a3150" />
      <rect x="130" y="82" width="14" height="60" rx="7" fill="#2a3150" />
      <rect x="74" y="150" width="22" height="70" rx="8" fill="#1d2238" />
      <rect x="104" y="150" width="22" height="70" rx="8" fill="#1d2238" />
      {equipped.weapon && (
        <g data-item="daga_guardian">
          <rect x="139" y="132" width="6" height="12" fill="#5b4a33" />
          <path d="M138 132 L146 132 L142 100 Z" fill="#c9d1ff" />
        </g>
      )}
      <circle cx="92" cy="50" r="2" fill="#1a1d2b" /><circle cx="108" cy="50" r="2" fill="#1a1d2b" />
    </svg>
  );
}

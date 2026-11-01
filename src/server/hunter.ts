import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { levelFromTotalXp } from "@/domain/game/xp";

/**
 * Carga el estado del cazador del usuario autenticado. El userId SIEMPRE procede
 * de la sesión del servidor, nunca de parámetros del cliente.
 */
export async function loadHunter(userId: string) {
  const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
  let [ch] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
  if (!ch) {
    // Recuperación si el hook de registro falló: crea el personaje de forma idempotente.
    await db
      .insert(schema.character)
      .values({ userId, hunterName: profile?.alias ?? "Cazador" })
      .onConflictDoNothing();
    [ch] = await db.select().from(schema.character).where(eq(schema.character.userId, userId));
  }
  return { profile: profile ?? null, character: ch!, level: levelFromTotalXp(ch!.totalXp) };
}

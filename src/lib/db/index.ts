import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // Reutiliza la conexión en desarrollo (recarga en caliente).
  var __umbralSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL. Copia .env.example a .env.");
  return postgres(url, { max: 10 });
}

const client = globalThis.__umbralSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__umbralSql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };

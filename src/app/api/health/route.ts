import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getAiStatus } from "@/ai/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "error";
  }
  const ai = getAiStatus();
  return Response.json(
    { status: database === "ok" ? "ok" : "degraded", database, ai: { mode: ai.mode, available: ai.available } },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

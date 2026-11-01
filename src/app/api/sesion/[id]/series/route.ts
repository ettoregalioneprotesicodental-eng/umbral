import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiUser, noStore } from "@/server/api";
import { deleteSet, upsertSet } from "@/server/training";

const setSchema = z.object({
  id: z.uuid(),
  slot: z.string().min(1).max(40),
  exerciseId: z.string().min(1).max(60),
  setIndex: z.number().int().min(0).max(50),
  kind: z.enum(["warmup", "working", "incomplete", "skipped"]),
  reps: z.number().int().min(0).max(1000).nullable(),
  seconds: z.number().int().min(0).max(36000).nullable(),
  load: z.object({ value: z.number().positive().max(1000), unit: z.enum(["kg", "lb"]) }).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  discomfort: z.boolean(),
  note: z.string().max(300).nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req);
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const body = setSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Datos de la serie no válidos" }, { status: 400 });
  try {
    const row = await upsertSet(db, user.id, id, body.data);
    return Response.json({ id: row.id, revision: row.revision }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req);
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  const setId = new URL(req.url).searchParams.get("setId");
  if (!setId || !z.uuid().safeParse(setId).success) return Response.json({ error: "Falta setId" }, { status: 400 });
  try {
    await deleteSet(db, user.id, id, setId);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}

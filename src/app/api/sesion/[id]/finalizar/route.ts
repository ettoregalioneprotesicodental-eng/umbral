import { db } from "@/lib/db";
import { apiError, apiUser, noStore } from "@/server/api";
import { finishSession } from "@/server/training";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req);
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const r = await finishSession(db, user.id, id);
    return Response.json(r, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}

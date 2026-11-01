import "server-only";
import { auth } from "@/lib/auth";
import { ConflictError, NotFoundError } from "@/server/training";

export async function apiUser(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  return s?.user ?? null;
}

export function apiError(e: unknown) {
  if (e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 404 });
  if (e instanceof ConflictError) return Response.json({ error: e.message }, { status: 409 });
  console.error(e);
  return Response.json({ error: "Error interno" }, { status: 500 });
}

export const noStore = { "Cache-Control": "no-store" };

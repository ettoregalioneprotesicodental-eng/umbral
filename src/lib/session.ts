import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Devuelve la sesión del usuario autenticado o redirige al acceso. */
export async function requireSession() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/acceso");
  return s;
}

export async function getOptionalSession() {
  return auth.api.getSession({ headers: await headers() });
}

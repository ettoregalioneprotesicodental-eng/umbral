import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Acceso · UMBRAL" };

export default async function AccesoPage() {
  if (await getOptionalSession()) redirect("/hoy");
  return (
    <main id="contenido" className="shell">
      <div className="auth-wrap">
        <section className="system-window">
          <p className="label">Sistema · Identificación</p>
          <AuthForm />
        </section>
      </div>
    </main>
  );
}

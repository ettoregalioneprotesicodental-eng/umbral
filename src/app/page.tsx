import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";

export default async function Home() {
  const s = await getOptionalSession();
  if (s) redirect("/hoy");
  return (
    <main id="contenido" className="shell">
      <div className="auth-wrap">
        <section className="system-window" style={{ textAlign: "center" }}>
          <div className="portal" aria-hidden="true" />
          <p className="label">Sistema</p>
          <h1>UMBRAL</h1>
          <p className="muted">
            Un portal se ha abierto. Cada día recibirás una misión ajustada a tu tiempo, tu material y tu
            recuperación. Tu constancia se convierte en el ascenso de tu cazador.
          </p>
          <Link className="btn btn-primary btn-block" href="/acceso">Despertar</Link>
        </section>
      </div>
    </main>
  );
}

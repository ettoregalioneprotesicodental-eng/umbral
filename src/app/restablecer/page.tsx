"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "El enlace no es válido o ha caducado." : null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (res.error) setError("El enlace no es válido o ha caducado. Solicita uno nuevo.");
    else setDone(true);
  }

  if (done) {
    return (
      <div className="alert alert-ok" role="status">
        Contraseña actualizada. Por seguridad se han cerrado las demás sesiones. <Link href="/acceso">Entrar</Link>
      </div>
    );
  }
  if (!token) {
    return <div className="alert alert-error" role="alert">{error ?? "Falta el token del enlace."} <Link href="/recuperar">Solicitar otro</Link></div>;
  }
  return (
    <form onSubmit={onSubmit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="password">Nueva contraseña</label>
        <input id="password" name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password" />
        <span className="hint">Mínimo 10 caracteres.</span>
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <main id="contenido" className="shell">
      <div className="auth-wrap">
        <section className="system-window">
          <p className="label">Sistema · Recuperación</p>
          <h1>Nueva contraseña</h1>
          <Suspense fallback={<p className="muted">Cargando…</p>}>
            <ResetForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

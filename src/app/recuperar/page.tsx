"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function RecuperarPage() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    try {
      const res = await authClient.requestPasswordReset({ email, redirectTo: "/restablecer" });
      // Por privacidad se muestra el mismo mensaje exista o no la cuenta.
      if (res.error && res.error.status !== 404) setError("No se pudo procesar la solicitud. Inténtalo más tarde.");
      else setSent(true);
    } catch {
      setError("No se pudo contactar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main id="contenido" className="shell">
      <div className="auth-wrap">
        <section className="system-window">
          <p className="label">Sistema · Recuperación</p>
          <h1>Recuperar acceso</h1>
          {sent ? (
            <div className="alert alert-ok" role="status">
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.
              <br />
              <span className="small">Modo de desarrollo: el enlace se guarda en el registro del servidor, no se envía ningún correo real.</span>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              <div className="field">
                <label htmlFor="email">Correo electrónico</label>
                <input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
                {pending ? "Enviando…" : "Enviar enlace"}
              </button>
            </form>
          )}
          <p className="small" style={{ marginTop: 16 }}><Link href="/acceso">Volver al acceso</Link></p>
        </section>
      </div>
    </main>
  );
}

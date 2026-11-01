"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "register";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setPending(true);
    try {
      const res =
        mode === "register"
          ? await authClient.signUp.email({ email, password, name: String(fd.get("alias") ?? "").trim() || "Cazador" })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.status === 429 ? "Demasiados intentos. Espera un minuto y vuelve a intentarlo." : translateError(res.error.code, res.error.message));
        return;
      }
      router.replace("/hoy");
      router.refresh();
    } catch {
      setError("No se pudo contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1>{mode === "login" ? "Entrar" : "Crear cuenta"}</h1>
      <div className="tabs" role="tablist" aria-label="Tipo de acceso">
        <button type="button" role="tab" className="btn" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(null); }}>
          Entrar
        </button>
        <button type="button" role="tab" className="btn" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(null); }}>
          Crear cuenta
        </button>
      </div>
      {error && <div className="alert alert-error" role="alert"><strong>Error:</strong>{error}</div>}
      <form onSubmit={onSubmit} noValidate={false}>
        {mode === "register" && (
          <div className="field">
            <label htmlFor="alias">Alias de cazador</label>
            <input id="alias" name="alias" autoComplete="nickname" required maxLength={40} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-describedby={mode === "register" ? "pw-hint" : undefined}
          />
          {mode === "register" && <span id="pw-hint" className="hint">Mínimo 10 caracteres.</span>}
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
          {pending ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
      {mode === "login" && (
        <p className="small" style={{ marginTop: 16 }}>
          <Link href="/recuperar">¿Has olvidado tu contraseña?</Link>
        </p>
      )}
    </>
  );
}

function translateError(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD": return "Correo o contraseña incorrectos.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return "Ya existe una cuenta con ese correo.";
    case "PASSWORD_TOO_SHORT": return "La contraseña debe tener al menos 10 caracteres.";
    case "INVALID_EMAIL": return "El correo no es válido.";
    default: return fallback ?? "No se pudo completar la operación.";
  }
}

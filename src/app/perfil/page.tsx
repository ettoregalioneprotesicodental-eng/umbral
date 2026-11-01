import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getProfile } from "@/server/training";
import { formAreas, formExercises, profileToForm } from "@/server/profile-form";
import { ProfileForm } from "@/components/profile-form";
import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Perfil · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  return (
    <AppShell current="/perfil" reducedMotion={profile.reducedMotion}>
      <div style={{ maxWidth: 720, margin: "0 auto" }} className="grid">
        <section className="system-window">
          <p className="label">Perfil</p>
          <h1>Tus datos de entrenamiento</h1>
          <p className="muted small">Cuenta: {user.email}. Si cambias algo, la misión de hoy se recalcula si aún no la has empezado; las sesiones ya hechas no se modifican.</p>
          <SignOutButton />
        </section>
        <ProfileForm initial={profileToForm(profile, user.name)} exercises={formExercises} areas={formAreas} submitLabel="Guardar cambios" />
      </div>
    </AppShell>
  );
}

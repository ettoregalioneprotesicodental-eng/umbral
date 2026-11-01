import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getProfile } from "@/server/training";
import { formAreas, formExercises, profileToForm } from "@/server/profile-form";
import { ProfileForm } from "@/components/profile-form";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata = { title: "Calibración · UMBRAL" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { user } = await requireSession();
  const profile = await getProfile(db, user.id);
  return (
    <main id="contenido" className="shell" style={{ maxWidth: 720 }}>
      <section className="system-window" style={{ marginBottom: 16 }}>
        <p className="label">Sistema · Calibración</p>
        <h1>Prepara tu portal</h1>
        <p className="muted">Solo se piden los datos que cambian tu plan. Podrás modificarlos en cualquier momento desde tu perfil. Si falta algo, el sistema empezará de forma conservadora y se ajustará con tus registros reales.</p>
        <SignOutButton />
      </section>
      <ProfileForm initial={profileToForm(profile, user.name)} exercises={formExercises} areas={formAreas} submitLabel="Completar calibración" />
    </main>
  );
}

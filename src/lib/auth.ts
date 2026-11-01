import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  telemetry: { enabled: false },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "UMBRAL · Restablecer acceso",
        text: `Sistema: se ha solicitado restablecer tu acceso.\nAbre este enlace para elegir una contraseña nueva (caduca en 1 hora):\n${url}\n\nSi no lo has pedido tú, ignora este mensaje.`,
      });
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: process.env.AUTH_RATE_LIMIT !== "off",
    window: 60,
    max: 30,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          const alias = created.name?.trim() || "Cazador";
          await db.insert(schema.profile).values({ userId: created.id, alias }).onConflictDoNothing();
          await db
            .insert(schema.character)
            .values({ userId: created.id, hunterName: alias })
            .onConflictDoNothing();
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envío de correo. En desarrollo y en modo demostración no se envía nada a internet:
 * el mensaje se guarda en .dev-mail/outbox.jsonl y se muestra en la consola del servidor.
 * Un proveedor real (con plan gratuito) se configurará más adelante con autorización.
 */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const mode = process.env.MAIL_MODE ?? "dev-outbox";
  if (mode !== "dev-outbox") {
    throw new Error(`Modo de correo no configurado: ${mode}`);
  }
  const dir = path.join(process.cwd(), ".dev-mail");
  await mkdir(dir, { recursive: true });
  await appendFile(
    path.join(dir, "outbox.jsonl"),
    JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n",
    "utf8",
  );
  console.info(`[correo de desarrollo] Para: ${mail.to} · ${mail.subject}\n${mail.text}`);
}

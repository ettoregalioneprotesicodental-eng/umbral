import { expect, type Page } from "@playwright/test";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function todayLabel(): string {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "short" }).format(new Date());
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return DAY_LABELS[idx]!;
}

export async function registerAndOnboard(page: Page, opts: { minutes?: number; lumbar?: boolean } = {}) {
  const email = `flow-${Date.now()}-${Math.floor(Math.random() * 1e6)}@prueba.local`;
  await page.goto("/acceso");
  await page.getByRole("tab", { name: "Crear cuenta" }).click();
  await page.getByLabel("Alias de cazador").fill("Rin");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("contrasena-segura-9");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).last().click();
  await page.waitForURL("**/hoy");
  await page.getByRole("link", { name: "Empezar calibración" }).click();
  await page.waitForURL("**/onboarding");

  await page.getByLabel("Zona horaria").fill("Europe/Madrid");
  await page.getByLabel("Confirmo que soy mayor de edad.").check();
  await page.getByLabel("He entrenado antes y estoy retomando").check();
  await page.getByLabel("Ganar fuerza").first().check();
  // Un solo día de entrenamiento (hoy) para que la misión sea siempre de fuerza.
  await page.locator(".chip", { hasText: todayLabel() }).first().click();
  await page.getByLabel("Minutos reales por sesión (incluye calentamiento)").fill(String(opts.minutes ?? 15));
  await page.getByLabel("Tengo mancuernas").check();
  await page.getByLabel("Pesos que puedes usar con ellas").fill("4, 6, 8, 10, 12");
  await page.getByLabel("Tengo esterilla").check();
  if (opts.lumbar) await page.locator(".chip", { hasText: "Zona lumbar" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole("button", { name: "Completar calibración" }).click();
  await page.waitForURL("**/hoy");
}


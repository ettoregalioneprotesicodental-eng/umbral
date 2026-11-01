import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@prueba.local`;
}

async function register(page: Page, alias: string, email: string, password: string) {
  await page.goto("/acceso");
  await page.getByRole("tab", { name: "Crear cuenta" }).click();
  await page.getByLabel("Alias de cazador").fill(alias);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).last().click();
  await page.waitForURL("**/hoy");
}

test("AC01: registro, panel Hoy, cierre y nuevo acceso", async ({ page }) => {
  const email = uniqueEmail("ac01");
  await register(page, "Kael", email, "contrasena-segura-1");
  await expect(page.getByTestId("hunter-name")).toHaveText("Kael");
  await expect(page.getByTestId("greeting")).toContainText("Kael");
  await expect(page.getByTestId("total-xp")).toHaveText("0");
  await expect(page.getByText("MODO DEMO · IA SIMULADA")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "100");

  await page.locator("button:visible", { hasText: "Salir" }).first().click();
  await page.waitForURL("**/acceso");

  await page.goto("/hoy");
  await page.waitForURL("**/acceso");

  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("contrasena-segura-1");
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await page.waitForURL("**/hoy");
  await expect(page.getByTestId("hunter-name")).toHaveText("Kael");
});

test("contraseña incorrecta muestra un error comprensible", async ({ page }) => {
  const email = uniqueEmail("bad");
  await register(page, "Iria", email, "contrasena-segura-2");
  await page.locator("button:visible", { hasText: "Salir" }).first().click();
  await page.waitForURL("**/acceso");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("otra-contrasena-mal");
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await expect(page.locator(".alert-error")).toContainText("Correo o contraseña incorrectos");
});

test("AC01: recuperación de acceso con enlace de restablecimiento", async ({ page }) => {
  const email = uniqueEmail("reset");
  await register(page, "Noa", email, "contrasena-original");
  await page.locator("button:visible", { hasText: "Salir" }).first().click();
  await page.waitForURL("**/acceso");

  await page.getByRole("link", { name: "¿Has olvidado tu contraseña?" }).click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si existe una cuenta");

  const outbox = await readFile(path.join(process.cwd(), ".dev-mail", "outbox.jsonl"), "utf8");
  const mail = outbox.trim().split("\n").map((l) => JSON.parse(l)).reverse().find((m) => m.to === email);
  expect(mail).toBeTruthy();
  const link = String(mail.text).match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();

  await page.goto(link!);
  await page.waitForURL("**/restablecer?token=*");
  await page.getByLabel("Nueva contraseña").fill("contrasena-nueva-123");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Contraseña actualizada");

  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("contrasena-nueva-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await page.waitForURL("**/hoy");
});

test("AC01: sin sesión no se accede a datos ni al panel", async ({ request, page }) => {
  await page.goto("/hoy");
  await page.waitForURL("**/acceso");
  const res = await request.get("/api/auth/get-session");
  expect(await res.text()).toMatch(/^(null)?$/);
});

test("AC21: accesible con teclado y sin desbordamiento horizontal", async ({ page }) => {
  await page.goto("/acceso");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("salud del servidor y manifiesto PWA", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: "ok", database: "ok", ai: { mode: "demo", available: false } });
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ short_name: "UMBRAL", display: "standalone" });
});

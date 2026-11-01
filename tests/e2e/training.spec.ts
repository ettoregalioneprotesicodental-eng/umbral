import { expect, test, type Page } from "@playwright/test";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function todayLabel(): string {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "short" }).format(new Date());
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return DAY_LABELS[idx]!;
}

async function registerAndOnboard(page: Page, opts: { minutes?: number; lumbar?: boolean } = {}) {
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

test("recorrido completo: calibración, chequeo, sesión, recarga, cierre y recompensa", async ({ page }) => {
  await registerAndOnboard(page, { minutes: 15 });

  // Chequeo diario con poco tiempo
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toBeVisible();
  await page.getByLabel("¿Cuántos minutos tienes hoy?").fill("12");
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toHaveCount(0);

  const mission = page.getByTestId("mission");
  await expect(mission.getByRole("heading", { name: /Fuerza A/ })).toBeVisible();
  const dur = await page.getByTestId("mission-duration").innerText();
  const minutes = Number(dur.match(/≈ (\d+) min/)![1]);
  expect(minutes).toBeLessThanOrEqual(12);

  await page.getByRole("button", { name: "Empezar misión" }).click();
  await page.waitForURL("**/sesion/*");
  await page.getByRole("button", { name: "Calentamiento hecho" }).click();

  // Primera serie y recarga en mitad de la sesión (AC04)
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await expect(page.getByLabel("Confirmada por el servidor").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 de \d+ series/)).toBeVisible();
  await expect(page.getByTestId("rest-timer")).toBeVisible(); // el descanso sobrevive a la recarga

  // Corregir la serie registrada (AC03) y deshacer un toque accidental
  await page.getByRole("button", { name: "Corregir serie 1" }).click();
  await page.getByRole("button", { name: "Restar 1" }).click();
  await page.getByRole("button", { name: "Guardar corrección" }).click();
  await expect(page.getByText(/1 de \d+ series/)).toBeVisible();

  // Completar todas las series restantes
  for (let i = 0; i < 30; i++) {
    const text = await page.getByText(/\d+ de \d+ series/).innerText();
    const [done, total] = text.match(/(\d+) de (\d+)/)!.slice(1).map(Number);
    if (done! >= total!) break;
    await page.getByTestId("log-set").click();
  }
  await expect(page.getByText("todo guardado")).toBeVisible();
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("summary")).toContainText("+100 XP");

  // Doble cierre no duplica: volver a Hoy muestra 100 XP
  await page.getByRole("link", { name: "Volver a Hoy" }).click();
  await expect(page.getByTestId("mission-done")).toContainText("Misión cumplida");
  await expect(page.getByTestId("total-xp")).toHaveText("100");

  await page.getByRole("link", { name: "Historial" }).first().click();
  await expect(page.getByRole("cell", { name: /Fuerza A/ })).toBeVisible();
});

test("AC10: una señal de alarma detiene la misión y muestra ayuda, sin penalización", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByText("¿Tienes alguno de estos síntomas ahora?").click();
  await page.getByLabel("Dolor u opresión en el pecho").check();
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByTestId("safety")).toContainText("112");
  await expect(page.getByTestId("mission")).toContainText("exenta");
  await expect(page.getByRole("button", { name: "Empezar misión" })).toHaveCount(0);
});

test("molestia lumbar declarada: sin peso muerto rumano; versión corta y posponer", async ({ page }) => {
  await registerAndOnboard(page, { minutes: 20, lumbar: true });
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toHaveCount(0);
  await page.getByText("Por qué esta misión hoy").click();
  await expect(page.getByTestId("mission")).toContainText("columna");
  await expect(page.getByTestId("mission")).not.toContainText("Peso muerto rumano");
  await page.getByRole("button", { name: "Versión corta" }).click();
  await expect(page.getByRole("button", { name: "Versión normal" })).toBeVisible();
  const dur = await page.getByTestId("mission-duration").innerText();
  expect(Number(dur.match(/≈ (\d+) min/)![1])).toBeLessThanOrEqual(10);
  await page.getByRole("button", { name: "Hoy no puedo" }).click();
  await expect(page.getByTestId("mission")).toContainText("Sin penalización");
});

test("biblioteca: ficha con instrucciones, alternativas y estado de revisión", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/ejercicios/goblet_squat");
  await expect(page.getByRole("heading", { name: "Sentadilla goblet" })).toBeVisible();
  await expect(page.getByText("Cuándo parar o adaptar")).toBeVisible();
  await expect(page.getByText(/revisión editorial interna/i).first()).toBeVisible();
  await page.getByRole("link", { name: "Sentadilla a silla" }).click();
  await expect(page.getByRole("heading", { name: "Sentadilla a silla" })).toBeVisible();
});

test("AC01: no se puede abrir la sesión de otro usuario", async ({ page, browser }) => {
  await registerAndOnboard(page);
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Empezar misión" }).click();
  await page.waitForURL("**/sesion/*");
  const url = page.url();
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await registerAndOnboard(p2);
  const res = await p2.goto(url);
  expect(res?.status()).toBe(404);
  const api = await p2.request.post(`${url.replace("/sesion/", "/api/sesion/")}/finalizar`);
  expect(api.status()).toBe(404);
  await other.close();
});

test("AC05: series registradas sin conexión se guardan en el dispositivo y se sincronizan sin duplicar", async ({ page, context }) => {
  await registerAndOnboard(page);
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toHaveCount(0);
  await page.getByRole("button", { name: "Empezar misión" }).click();
  await page.waitForURL("**/sesion/*");
  await page.getByRole("button", { name: "Calentamiento hecho" }).click();

  await context.setOffline(true);
  await page.getByTestId("log-set").click();
  await page.getByTestId("log-set").click();
  await expect(page.getByText(/sin conexión/)).toBeVisible();
  await expect(page.getByText(/2 de \d+ series/)).toBeVisible();
  await page.getByTestId("finish").click();
  await expect(page.getByText(/guardadas solo en este dispositivo/)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("todo guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/2 de \d+ series/)).toBeVisible();
  // sin desbordamiento horizontal en la sesión
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByTestId("finish").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  const xp = Number((await page.getByTestId("summary").innerText()).match(/\+(\d+) XP/)![1]);
  expect(xp).toBeGreaterThan(0);
  expect(xp).toBeLessThan(100);
});

import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("entrenador en modo demo: explica, propone una versión más corta y aplicarla cambia la misión", async ({ page }) => {
  await registerAndOnboard(page, { minutes: 20 });
  await page.getByRole("button", { name: "Ajustar misión" }).click();
  await expect(page.getByRole("heading", { name: "¿Cómo llegas hoy?" })).toHaveCount(0);
  const before = await page.locator('[aria-label="Ejercicios de hoy"] li').count();

  await page.getByRole("link", { name: "Entrenador" }).first().click();
  await page.waitForURL("**/entrenador");
  await expect(page.getByTestId("ai-mode")).toContainText("Modo demostración");
  await page.getByLabel("Tu pregunta").fill("¿Por qué esta misión hoy?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator('.msg[data-origin="template"]').last()).toContainText("[Demostración] Hoy toca");
  await expect(page.locator('.msg[data-origin="template"]').last()).toContainText("Plantilla de demostración");

  await page.getByLabel("Tu pregunta").fill("Hazla más corta, por favor");
  await page.getByRole("button", { name: "Enviar" }).click();
  const proposal = page.getByTestId("proposal").last();
  await expect(proposal).toContainText("pendiente");
  // La misión no cambia hasta que el usuario lo decide.
  await page.goto("/hoy");
  await expect(page.locator('[aria-label="Ejercicios de hoy"] li')).toHaveCount(before);
  await page.goto("/entrenador");
  await page.getByRole("button", { name: "Aplicar a mi misión" }).click();
  await page.waitForURL("**/hoy");
  await expect(page.locator('[aria-label="Ejercicios de hoy"] li')).toHaveCount(before - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("cazador: avatar, jefe con sellos, crónica e inventario", async ({ page }) => {
  await registerAndOnboard(page);
  await expect(page.getByTestId("boss-hint")).toContainText("0 de 3 sellos");
  await page.getByRole("link", { name: "Cazador" }).first().click();
  await page.waitForURL("**/cazador");
  await expect(page.getByTestId("avatar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guardián del Umbral" })).toBeVisible();
  await expect(page.getByTestId("boss-status")).toContainText("0 de 3 sellos rotos");
  await expect(page.getByTestId("chronicle")).toContainText("Prólogo");
  await expect(page.getByTestId("momentum")).toHaveText("100");
  await expect(page.getByText("Aún sin objetos")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

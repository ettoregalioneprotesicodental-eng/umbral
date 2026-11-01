import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://umbral:umbral_dev@localhost:5432/umbral_test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "escritorio-chromium", use: { ...devices["Desktop Chrome"] } },
    // Emulación de Android en Chromium (Pixel 7). No sustituye a probar en un dispositivo real.
    { name: "android-emulado", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: TEST_DB,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      AI_MODE: "demo",
      // Las pruebas crean muchas cuentas seguidas desde la misma IP; el límite se prueba aparte.
      AUTH_RATE_LIMIT: "off",
    },
  },
});

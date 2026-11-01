# UMBRAL — Sistema del Cazador

Aplicación web instalable (PWA) de entrenamiento físico personal con progresión de cazador. El entrenamiento se decide con reglas comprobables; la IA (Claude) explica y propone, pero nunca concede recompensas ni guarda planes sin validación.

> **Estado:** paso 2 de 4. Ya puedes calibrar tu perfil, recibir la misión del día ajustada a tu tiempo y material, entrenar con la sesión guiada, registrar series y ganar XP. La IA funciona en **modo demostración** (sin coste). Detalle en [`docs/ESTADO.md`](docs/ESTADO.md).

## Documentos

| Documento | Contenido |
|---|---|
| [`docs/PROMPT_MAESTRO.md`](docs/PROMPT_MAESTRO.md) | Visión completa del producto (fuente de verdad) |
| [`docs/ESTADO.md`](docs/ESTADO.md) | Qué funciona, qué falta, punto de reanudación |
| [`docs/REQUISITOS.md`](docs/REQUISITOS.md) | Mapa de requisitos AC01–AC24 con fase y forma de prueba |
| [`docs/DECISIONES.md`](docs/DECISIONES.md) | Stack, arquitectura, supuestos y compatibilidad |
| [`docs/SIMULACION_XP.md`](docs/SIMULACION_XP.md) | Ritmo de niveles simulado a 30/90/365 días |

## Probarlo en tu ordenador (Windows)

Necesitas instalar dos programas gratuitos una sola vez:

1. **Node.js 22 LTS**: <https://nodejs.org/> → botón «LTS» → instala con las opciones por defecto.
2. **Docker Desktop** (para la base de datos): <https://www.docker.com/products/docker-desktop/> → instala y ábrelo. Es gratuito para uso personal.
3. **Git**: <https://git-scm.com/download/win>.

Después abre **PowerShell** y ejecuta, línea por línea:

```powershell
git clone https://github.com/ettoregalioneprotesicodental-eng/umbral.git
cd umbral
copy .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run build
npm start
```

Abre <http://localhost:3000> en Chrome o Edge y pulsa **Despertar** para crear tu cuenta.

Antes del primer uso, edita `.env` y cambia `BETTER_AUTH_SECRET` por un valor aleatorio. Puedes generarlo con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Probarlo en tu móvil Android (misma red wifi)

Mientras `npm start` está en marcha en el ordenador, el móvil puede abrir `http://IP-DEL-ORDENADOR:3000`, pero la instalación como app y el modo offline exigen HTTPS. Eso se resolverá en el paso 4 con un despliegue gratuito o un túnel seguro; hasta entonces usa el navegador del ordenador o la vista móvil de Chrome (F12 → icono de móvil).

### Recuperar contraseña en local

No se envían correos reales. El enlace de restablecimiento aparece en la consola donde ejecutas `npm start` y en `.dev-mail/outbox.jsonl`.

## Primer uso

1. Crea tu cuenta y pulsa **Empezar calibración**.
2. Rellena tus días, minutos reales, material (por ejemplo, los pesos de tus mancuernas) y cualquier molestia que quieras declarar.
3. En **Hoy** haz el chequeo de 20 segundos y pulsa **Empezar misión**.
4. En la sesión: «Serie hecha» registra la serie y arranca el descanso. Toca una serie registrada para corregirla.
5. Al terminar verás el resumen y la XP. Tu historial está en **Historial**.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga |
| `npm run build` / `npm start` | Compilar y ejecutar en modo producción |
| `npm run db:migrate` | Aplicar migraciones a la base de datos |
| `npm run db:generate` | Crear una migración tras cambiar `src/lib/db/schema.ts` |
| `npm test` | Pruebas unitarias e integración (necesita la base `umbral_test`) |
| `npm run test:e2e` | Pruebas de extremo a extremo con Playwright (escritorio + Android emulado) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run sim:xp` | Simulación de la curva de experiencia |

## Secretos

Las claves (`BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`) van solo en `.env` local o en los secretos del servidor de despliegue. Nunca en el repositorio ni en el chat. `.env` está en `.gitignore`.

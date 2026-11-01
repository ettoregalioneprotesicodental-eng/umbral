# Estado del proyecto

Última actualización: 2026-11-01 · Paso 1 de 4 (base ejecutable) **completado**.
Leyenda: **probado** = prueba automática ejecutada y en verde · **simulado** = funciona con un sustituto identificado · **pendiente** = no implementado.

## Qué funciona realmente (probado)
- Registro, inicio y cierre de sesión con contraseña (mín. 10 caracteres), sesiones en base de datos y límite de intentos.
- Recuperación de acceso con enlace de un solo uso que caduca en 1 hora y cierra las demás sesiones.
- Al registrarse se crean el perfil y el personaje (rango E, nivel 1, impulso 100).
- Panel «Hoy» para móvil y escritorio: saludo del sistema, estado de la misión, ficha del cazador con barra de XP accesible.
- Reglas de juego versionadas (`game-v1`): curva de XP, cumplimiento parcial, barra de impulso con suelo, tope semanal y recuperación diaria.
- Libro de eventos de XP en PostgreSQL: concesión atómica e idempotente (AC06), corrección única que no permite reclamar otra vez (AC24), sin acceso a eventos de otro usuario.
- Manifiesto PWA y endpoint `/api/health`.
- Cabeceras de seguridad básicas; ninguna clave en el bundle del cliente (comprobado buscando el valor del secreto en `.next/static`).

## Qué está simulado (identificado en la interfaz)
- **IA**: modo demostración. El saludo es una plantilla y la app lo indica. No hay llamadas a la API.
- **Correo**: los enlaces de recuperación se guardan en `.dev-mail/outbox.jsonl` y en la consola del servidor; no se envían.

## Pendiente
- Paso 2: onboarding, catálogo de ejercicios con fuentes, misión diaria, registro de series, temporizador, historial y motor de progresión.
- Paso 3: integración real con Claude (preparada por configuración, sin activar), XP por misión, avatar, jefe, penalizaciones.
- Paso 4: service worker, offline, sincronización, instalación en Android con HTTPS, iconos PNG 192/512 para instalación en Android.
- Pasos 5–6: ver `docs/REQUISITOS.md`.
- Despliegue público: no realizado (sin autorización de servicios). Hoy solo se ejecuta en local.

## Pruebas ejecutadas (2026-11-01, contenedor Linux, Node 22, PostgreSQL 16)
| Conjunto | Resultado |
|---|---|
| `npm run typecheck` | sin errores |
| `npm run build` | correcto |
| `npm test` (Vitest: 13 unitarias + 5 integración con BD real) | 18/18 |
| `npm run test:e2e` (Playwright: Chromium escritorio + Pixel 7 emulado, 6 escenarios × 2 proyectos, repetido 3 veces) | 36/36 |

Las pruebas en «Pixel 7 emulado» son emulación de viewport y táctil en Chromium; **no** equivalen a probar en un Android real ni en iPhone.

## Limitaciones conocidas
- `npm audit` marca 4 avisos moderados en `esbuild` dentro de `drizzle-kit` (herramienta de desarrollo, no se ejecuta en la app).
- El límite de intentos de acceso se desactiva solo en las pruebas E2E (`AUTH_RATE_LIMIT=off`), porque crean muchas cuentas seguidas.
- `BETTER_AUTH_URL` debe coincidir con la URL desde la que se abre la app; si no, el servidor rechaza el acceso por protección de origen.

## Punto de reanudación
Siguiente acción: **paso 2**. Empezar por `src/domain/training/` (tipos de cantidades con unidad, catálogo inicial para casa con mancuernas y esterilla), después onboarding en `src/app/onboarding/` que rellene `profile`, y luego el generador de la misión diaria.

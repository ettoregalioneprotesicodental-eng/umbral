# Mapa de requisitos

Prioridad: **P0** imprescindible para usar la app a diario, **P1** necesario para la visión, **P2** mejora.
Estado: ✅ probado · 🟡 parcial · ⬜ pendiente. «Probado» significa con prueba automática ejecutada; ver `docs/ESTADO.md`.

## Criterios de aceptación del prompt maestro

| ID | Requisito | Prio | Fase | Depende de | Cómo se comprueba | Estado |
|---|---|---|---|---|---|---|
| AC01 | Registro, acceso, recuperación; aislamiento entre usuarios | P0 | 1–2 | — | E2E `auth.spec.ts`, `training.spec.ts`; integración `training.test.ts` (sesiones y series ajenas → 404) | ✅ |
| AC02 | Sesión compatible con poco tiempo y material limitado | P0 | 2 | motor, catálogo | Unidad `planner.test.ts` (10/15/20 min × 3 tipos); E2E con 12 min | ✅ |
| AC03 | Prescripción ≠ ejecución; corregir una serie no destruye el resto | P0 | 2 | registro | Integración + E2E de corrección | ✅ |
| AC04 | Sesión en curso sobrevive a recargar y reabrir | P0 | 2/4 | registro | E2E: recarga a mitad de sesión conserva series y descanso | ✅ (página ya abierta; abrir sin conexión: paso 4) |
| AC05 | Offline + sync sin perder ni duplicar series | P0 | 4 | cola local | Integración (reenvío idempotente) + E2E sin conexión | 🟡 cola y sincronización ✅; service worker pendiente |
| AC06 | Dos dispositivos → una sola recompensa | P0 | 1 | libro XP | Integración: 5 concesiones concurrentes | ✅ |
| AC07 | Fallo intermedio sin XP huérfana ni daño doble | P0 | 2–3 | transacción de cierre | Integración con fallo inyectado tras XP, sello e impulso (`game.test.ts`) | ✅ |
| AC08 | Sin progresión con datos insuficientes/anómalos | P0 | 2 | motor | Unidad `progression.test.ts` | ✅ |
| AC09 | Propuesta fuera de límites rechazada aunque la pida Claude | P0 | 3 | validador | Integración `ai.test.ts` con cliente simulado (ejercicio inventado, series excesivas, lumbar) | ✅ |
| AC10 | Dolor bloquea el ajuste, sin castigo ni bonus | P0 | 2 | chequeo diario | Unidad + integración + E2E | ✅ |
| AC11 | Descanso/enfermedad/vacaciones/fallo técnico sin castigo | P0 | 3 | penalizaciones | Integración `game.test.ts` (posponer, descanso, penalización desactivada, reversión) | ✅ |
| AC12 | Una sola penalización dentro del máximo; revertible | P1 | 3 | impulso | Unidad `momentum.test.ts` + integración `game.test.ts` (máximo semanal, reproceso, reversión única) | ✅ |
| AC13 | Jefe usa trabajo planificado, sin volumen extra | P1 | 3 | jefes | Integración `game.test.ts` (3 misiones = 3 sellos; prescripción intacta) | ✅ |
| AC14 | Cambios de día/zona/horario no duplican | P0 | 2–5 | calendario | Unidad (zonas IANA, cambio de hora) + integración (misión única en paralelo) | 🟡 misiones ✅; recordatorios en paso 4 |
| AC15 | IA caída/límite/JSON inválido no rompe el entrenamiento | P0 | 3 | adaptador IA | Integración `ai.test.ts` (conexión caída, error, entrada mal formada, negativa) | ✅ |
| AC16 | Página web maliciosa no cambia permisos ni reglas | P1 | 5 | investigación | Integración | ⬜ |
| AC17 | Ejercicio de internet no entra sin revisión | P1 | 5 | catálogo | Integración | ⬜ |
| AC18 | Escena narrativa no concede objetos ni récords | P1 | 3 | narrativa | Integración `ai.test.ts` + unidad (no hay herramientas de recompensa) | ✅ |
| AC19 | Secretos fuera de bundles, respuestas, repo y logs | P0 | 1→6 | — | Búsqueda en `.next/static` + revisión del repo | 🟡 comprobado manualmente en paso 1 |
| AC20 | Exportación, borrado y cierre de sesión respetan alcance | P0 | 6 | — | E2E | ⬜ |
| AC21 | Usable en móvil y escritorio, teclado, movimiento reducido | P0 | 1→4 | — | E2E escritorio + Pixel 7 emulado; foco visible; `prefers-reduced-motion` | 🟡 pantallas actuales ✅ |
| AC22 | Temporizador recupera estado tras segundo plano | P0 | 2/4 | registro | Unidad `dates-timer.test.ts` + E2E recarga | ✅ |
| AC23 | Presupuesto limita trabajos y reintentos antes de gastar | P0 | 3/5 | IA, cola | Integración `ai.test.ts` (sin presupuesto no se llama; reservas concurrentes; una por usuario) | 🟡 chat ✅; cola de trabajos en paso 5 |
| AC24 | Corregir/deshacer no permite reclamar XP repetida | P0 | 1 | libro XP | Integración | ✅ |

## Requisitos de producto por fase

| Fase | Entrega | Prio |
|---|---|---|
| 1 | Proyecto ejecutable, BD + migraciones, auth, sistema visual, reglas de XP versionadas, docs | P0 |
| 2 | Onboarding (datos del prompt §4), catálogo inicial con fuentes, misión del día ajustada al tiempo real, registro de series con temporizador por marcas de tiempo, historial, motor de progresión reglado (mantener/progresar/reducir/sustituir/pausar) | P0 |
| 3 | Adaptador Claude con herramientas limitadas y validación, presupuesto, XP por misión, avatar, jefe «Guardián del Umbral», penalización configurable | P0/P1 |
| 4 | Service worker, IndexedDB, cola de sincronización, conflictos, instalación guiada, notificaciones | P0 |
| 5 | Seis arquetipos de jefe, capítulos, colecciones, cola de trabajos, investigación web con revisión | P1 |
| 6 | Exportación, borrado de cuenta, auditoría de aislamiento, accesibilidad, rendimiento, guía de despliegue y copias | P0 |

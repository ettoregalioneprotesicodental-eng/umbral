# Estado del proyecto

Última actualización: 2026-11-01 · Paso 2 de 4 (circuito completo de entrenamiento) **completado**.
Leyenda: **probado** = prueba automática ejecutada y en verde · **simulado** = funciona con un sustituto identificado · **pendiente** = no implementado.

## Qué funciona realmente (probado)

### Cuenta (paso 1)
- Registro, acceso, cierre de sesión y recuperación de contraseña con enlace de un solo uso.
- Límite de intentos de acceso y protección de origen.

### Entrenamiento (paso 2)
- **Onboarding y perfil editable**: alias, zona horaria, edad adulta, experiencia, objetivo, días y minutos reales, lugar, mancuernas con sus pesos y unidad, esterilla, zonas con molestias, ejercicios a evitar, penalizaciones, narrativa y movimiento reducido. Sin peso, medidas ni fotos.
- **Catálogo** de 25 fichas (casa con mancuernas y esterilla, más variantes sin material y de movilidad) con objetivo, patrón, zonas, material, pasos, respiración, errores, señales para parar, alternativas más fáciles/difíciles, fuentes y estado de revisión. Sin vídeos: no hay recursos visuales verificados.
- **Calendario semanal estable**: con 5 días, Fuerza A, Fuerza B, movilidad, Fuerza A, Fuerza B y dos descansos planificados. El descanso cuenta como misión cumplida.
- **Misión del día** generada en el servidor con la zona horaria del perfil, una por día (índice único). La duración incluye calentamiento, series, descansos y transiciones, y nunca supera el tiempo disponible. Formato por parejas en sesiones cortas.
- **Chequeo diario**: minutos disponibles, energía, cansancio, molestias por zona y síntomas de alarma. La misión se recalcula mientras no se haya empezado. Una señal de alarma detiene la recomendación, muestra cómo buscar ayuda (112 si es urgente) y deja la misión exenta sin penalización.
- **Versión corta**, **«Hoy no puedo»** (pospone sin penalizar ni acumular) y **confirmar descanso**.
- **Molestia lumbar declarada**: solo variantes con poca carga sobre la columna (p. ej. puente de glúteos en lugar de peso muerto rumano). No es un diagnóstico.
- **Sesión guiada**: calentamiento, serie actual con objetivo y resultado de la última sesión comparable, repeticiones o segundos, peso por mancuerna, esfuerzo opcional (repeticiones en reserva) con explicación, molestia por serie, serie incompleta, omitir ejercicio, sustituir por una alternativa compatible, corregir cualquier serie y deshacer.
- **Temporizador de descanso** basado en marcas de tiempo: empieza al registrar la serie (nunca al revés), se puede pausar, ajustar o saltar, y sobrevive a recargar o bloquear el móvil.
- **Guardado resistente**: cada serie se guarda primero en el dispositivo con un id único y se envía al servidor; sin conexión queda en cola y se sincroniza al volver sin duplicar. La interfaz indica si está en el dispositivo, pendiente o confirmada.
- **Cierre de sesión** en una sola transacción: resultados, estado de la misión y XP (100 completa, proporcional si es parcial). Cerrar dos veces o desde dos pestañas no duplica, y un fallo intermedio no deja XP huérfana.
- **Motor de progresión reglado** (`training-v1`): mantener, progresar, reducir, sustituir o calibrar, con explicación basada en registros reales. Progresión doble: consolida el rango en 2 sesiones comparables antes de subir carga; sin más carga disponible pasa a una variante más difícil y después a una serie más; una sola palanca cada vez. Fatiga alta, molestia o rendimiento bajo reducen; registros anómalos (repeticiones imposibles, unidad distinta, carga mayor que el material) se descartan. Tras 14 días sin entrenar retoma un paso por debajo.
- **Validador**: toda prescripción pasa por comprobaciones de catálogo, material, ejercicios a evitar, restricciones del día, series, rangos, cargas y duración antes de guardarse.
- **Historial** de sesiones y evolución por ejercicio sin mezclar cargas ni unidades.
- **Biblioteca** de ejercicios con ficha completa.

## Qué está simulado (identificado en la interfaz)
- **IA**: modo demostración. Saludos de plantilla marcados como tales. No hay llamadas a la API.
- **Correo**: los enlaces de recuperación se guardan en `.dev-mail/outbox.jsonl` y en la consola.

## Pendiente
- Paso 3: integración real con Claude (preparada por configuración, sin activar por decisión de coste), avatar, jefe «Guardián del Umbral», penalización de impulso por omisión, misiones secundarias.
- Paso 4: service worker para abrir la app sin conexión (hoy el registro offline funciona si la página ya está abierta), instalación como app en Android con HTTPS, iconos PNG, notificaciones, resolución de conflictos entre dos dispositivos editando la misma serie (hoy gana la última revisión, que se conserva numerada).
- Fichas: revisión por una persona cualificada; recursos visuales con licencia.
- Planes versionados como tablas separadas (hoy cada misión guarda su prescripción completa y la versión de reglas).

## Pruebas ejecutadas (2026-11-01, contenedor Linux, Node 22, PostgreSQL 16)
| Conjunto | Resultado |
|---|---|
| `npm run typecheck` / `npm run build` | correctos |
| `npm test` (Vitest: 54 unitarias + 19 de integración con PostgreSQL real) | 73/73 |
| `npm run test:e2e` (Playwright: 12 escenarios × escritorio Chromium y Pixel 7 emulado, repetido 2 veces) | 48/48 |

Las pruebas E2E encontraron y se corrigieron tres fallos reales: el campo de minutos rechazaba valores que no fueran múltiplos de 5, el formulario de calibración se desbordaba en móvil, y en móvil no había forma de cerrar sesión antes de completar la calibración.

«Pixel 7 emulado» es emulación de pantalla y táctil en Chromium: **no** equivale a un Android real.

## Limitaciones conocidas
- `npm audit`: 4 avisos moderados de `esbuild` dentro de `drizzle-kit` (solo desarrollo).
- Las fuentes de las fichas no están verificadas todavía (`verified: false`).
- Si se borran los datos del navegador con series sin sincronizar, esas series se pierden.

## Punto de reanudación
Siguiente acción: **paso 3**. Empezar por `src/ai/` (adaptador de Claude con herramientas limitadas y esquema de propuesta que pase por `validatePrescription`), presupuesto de uso y modo demo, después avatar, misiones y jefe en `src/domain/game/`.

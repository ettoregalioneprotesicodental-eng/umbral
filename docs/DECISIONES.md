# Decisiones técnicas

Registro de decisiones. Todas son reversibles salvo que se indique. Fecha de la versión inicial: 2026-11-01.

## D01 · Una sola PWA con backend real
Una aplicación web responsive instalable cubre Windows y Android (prioridades), con cuentas, sincronización e IA en el servidor. No se construyen apps nativas: ninguna necesidad actual lo justifica. Se reevaluará solo si notificaciones o segundo plano en iPhone resultan imprescindibles.

## D02 · Stack
| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript en cliente y servidor | Un solo lenguaje, tipos compartidos |
| Framework | Next.js 16 (App Router) | Interfaz y API en un despliegue; muy mantenido |
| Base de datos | PostgreSQL 16 | Transacciones, restricciones e índices para el libro de eventos |
| ORM / migraciones | Drizzle ORM + drizzle-kit | SQL explícito, migraciones versionadas en `drizzle/` |
| Autenticación | Better Auth 1.7 (email + contraseña) | Mantenido, hash de contraseñas propio de la librería, sesiones en BD, límite de intentos |
| Pruebas | Vitest (unidad + integración con BD real) y Playwright (E2E) | |
| Offline (paso 4) | IndexedDB (previsto: Dexie) + service worker | |
| Cola de tareas (paso 5) | Tabla de trabajos en PostgreSQL (previsto: pg-boss) | Evita un servicio adicional de pago |
| IA (paso 3) | SDK oficial de Anthropic en el servidor, modelo por configuración | Clave solo en secretos del servidor |

TypeScript se fija en 5.9: la versión 7 es reciente y no aporta nada necesario todavía.

## D03 · Módulos separados
```
src/domain/game     reglas de juego puras + libro de XP (sin UI ni IA)
src/domain/training motor de entrenamiento (paso 2)
src/ai              capa de IA sustituible (demo / claude)
src/lib             base de datos, autenticación, correo
src/server          consultas del servidor; el userId sale siempre de la sesión
src/app             pantallas y rutas
```

## D04 · El servidor es la autoridad de recompensas
El cliente nunca envía cantidades de XP. `experience_event` es un libro de eventos con clave idempotente única `(user_id, idempotency_key)`; la concesión bloquea la fila del personaje dentro de una transacción. Las correcciones son eventos negativos únicos por evento corregido.

## D05 · Coste cero durante el prototipo
Decisión de Ettore: no contratar servicios ni activar consumo de API.
- IA en modo demostración (`AI_MODE=demo`), etiquetada en la interfaz. Los mensajes de plantilla se marcan como tales.
- Correo en modo `dev-outbox`: los enlaces de recuperación se guardan en local, no se envían.
- Sin despliegue público todavía. Opciones gratuitas a evaluar en el paso 4, con aprobación previa: Vercel Hobby / Netlify para la app y Neon o Supabase (plan gratuito) para PostgreSQL. Ninguna se ha contratado.

## D06 · Hora y calendario
Instantes en UTC (`timestamptz`); el calendario del usuario usa una zona IANA en `profile.time_zone` (por defecto `Europe/Madrid`, editable).

## D07 · Datos personales fuera del repositorio
El repositorio es público. Los datos iniciales del usuario (material, experiencia, molestias, objetivo) se introducen en el onboarding y viven solo en su base de datos.

## D08 · Misión diaria con prescripción embebida
Cada misión (`planned_session`) guarda su prescripción completa, la versión de reglas y una revisión. Se puede regenerar mientras no se ha empezado; al empezar se copia a `workout_session` y queda inmutable. Es más simple que tablas separadas de planes y versiones y cumple la trazabilidad necesaria por ahora.

## D09 · Registro de series con id del cliente
El cliente genera el id de cada serie y la guarda primero en `localStorage` en una cola. El servidor hace `upsert` por id comprobando propietario y sesión. Así los reenvíos no duplican y el registro sobrevive a recargas y cortes. IndexedDB y service worker llegan en el paso 4.

## D10 · Calendario y progresión
Calendario fijo por días elegidos (A/B/movilidad) para poder comparar sesiones. La variedad no cambia los ejercicios base; la progresión usa una sola palanca cada vez (carga → variante → series) y reglas en `src/domain/training/rules.ts`.

## D11 · Claude con herramientas limitadas y bucle manual
El entrenador usa el SDK oficial `@anthropic-ai/sdk` con un bucle manual de herramientas (máximo 3 vueltas; la última sin herramientas para obligar a cerrar). Pensamiento adaptativo y esfuerzo `low` para acotar coste. Seis herramientas de solo lectura y una de propuesta, todas con `strict: true` y ejecutadas con el usuario de la sesión. No existe ninguna herramienta que conceda XP u objetos ni que guarde planes: `propose_plan_revision` deja una propuesta que pasa por `validatePrescription` y que el usuario aplica con un botón si la misión no ha cambiado (revisión). No se usa reintento automático con otro modelo: si la API falla, la respuesta es un aviso y el entrenamiento sigue igual.

## D12 · Presupuesto de IA reservado antes de gastar
Cada llamada reserva su peor caso (iteraciones × tokens máximos × precio) bajo un bloqueo de PostgreSQL y después liquida el coste real. Topes diario y mensual configurables, y una ejecución a la vez por usuario. Modelo sin precio conocido = precio más alto.

## D13 · Juego derivado del registro
Sellos del jefe, impulso, objetos y rango se calculan en la misma transacción que cierra la misión, con índices únicos por misión. El jefe se derrota con misiones planificadas (sin volumen extra). Las misiones omitidas se procesan con un día de margen, solo de los últimos 7 días, una vez por misión y dentro del máximo semanal; cualquier penalización se puede revertir (enfermedad, viaje, fallo) y la misión queda exenta. Los textos de historia son plantillas originales; la IA puede narrar con `get_campaign_state`, pero no crear hechos.

## Supuestos del perfil de arranque
Los datos personales del usuario no se guardan en este repositorio público. El diseño asume un perfil de arranque exigente para las restricciones: entrenamiento en casa con material mínimo (mancuernas ligeras y esterilla), regreso tras un periodo de inactividad, sesiones cortas (10–20 min) varios días a la semana y alguna molestia ocasional declarada. El onboarding confirmará y permitirá editar cada dato. Si faltan datos, la calibración es conservadora.

## Matriz de compatibilidad prevista (a verificar en el paso 4)
| Plataforma | Navegador | Uso en navegador | Instalación | Offline | Notificaciones |
|---|---|---|---|---|---|
| Windows | Chrome / Edge | Sí | Sí (PWA) | Sí | Sí, con permiso |
| Android | Chrome | Sí | Sí (PWA) | Sí | Sí, con permiso |
| macOS | Safari / Chrome | Sí | Safari 17+: «Añadir al Dock»; Chrome: sí | Sí | Sí, con permiso |
| iPhone | Safari | Sí | Solo «Añadir a pantalla de inicio» | Sí, limitado | Solo si está añadida a inicio (iOS 16.4+); sin garantía de tareas en segundo plano |

Alternativa donde no haya notificaciones fiables: recordatorios dentro de la app al abrirla. Estado: **pendiente de verificar**; solo se ha probado Chromium de escritorio y emulación de Pixel 7.

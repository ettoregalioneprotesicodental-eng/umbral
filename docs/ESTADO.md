# Estado del proyecto

Última actualización: 2026-11-01 · Paso 3 de 4 (IA preparada, avatar y primer arco jugable) **completado**.
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

### IA y juego (paso 3)
- **Entrenador** (`/entrenador`): chat sobre tu misión. Con Claude activado usa un bucle de herramientas limitadas (perfil, misión de hoy, historial, ejercicios aprobados, estado de campaña y una herramienta para **proponer** cambios). No puede dar XP, objetos ni cambiar reglas. Cada propuesta pasa por el mismo validador que el plan y solo se aplica si pulsas «Aplicar» y la misión no ha cambiado entretanto.
- **Presupuesto de IA**: se reserva el peor caso antes de cada llamada, con topes diario y mensual y una ejecución a la vez por usuario. Si no cabe, no se llama y se avisa. Si la API cae o responde mal, el entrenamiento sigue igual.
- **Jefe «Guardián del Umbral»**: tres sellos; cada misión planificada de entrenamiento o movilidad completada rompe uno. Sin volumen extra. Al derrotarlo: 150 XP una sola vez, Daga del Guardián y Sombra compañera.
- **Avatar** vectorial original con capa (nivel 3), aura azul (5), aura violeta (10), armadura (15) y los objetos del jefe. Respeta «reducir animaciones».
- **Impulso**: +5 por misión válida (una vez al día). Las misiones de entrenamiento sin hacer ni reprogramar restan 5 a partir del segundo día, como máximo 15 por semana y nunca por debajo de 70. Se puede revertir cada penalización («fue enfermedad, viaje o un fallo»). «Hoy no puedo», descansos y exenciones nunca penalizan; con penalizaciones desactivadas no se resta nada.
- **Rango D**: jefe derrotado y 12 misiones cumplidas.
- **Crónica**: prólogo, capítulo 1 y líneas de cada sello, como hechos guardados. La historia solo refleja lo registrado.

## Qué está simulado (identificado en la interfaz)
- **IA**: modo demostración. El entrenador responde con plantillas marcadas «[Demostración]» y puede proponer una versión más corta usando las reglas (sin IA). No hay llamadas a la API ni coste. La integración real está implementada y probada con un cliente simulado, **no** contra la API real (no autorizado).
- **Correo**: los enlaces de recuperación se guardan en `.dev-mail/outbox.jsonl` y en la consola.

## Pendiente
- Activar Claude real: requiere tu decisión, una clave y saldo (ver README, «Activar Claude»).
- Misiones secundarias, más jefes y capítulos (paso 5).
- Paso 4: service worker para abrir la app sin conexión (hoy el registro offline funciona si la página ya está abierta), instalación como app en Android con HTTPS, iconos PNG, notificaciones, resolución de conflictos entre dos dispositivos editando la misma serie (hoy gana la última revisión, que se conserva numerada).
- Fichas: revisión por una persona cualificada; recursos visuales con licencia.
- Planes versionados como tablas separadas (hoy cada misión guarda su prescripción completa y la versión de reglas).

## Pruebas ejecutadas (2026-11-01, contenedor Linux, Node 22, PostgreSQL 16)
| Conjunto | Resultado |
|---|---|
| `npm run typecheck` / `npm run build` | correctos |
| `npm test` (Vitest: 59 unitarias + 40 de integración con PostgreSQL real) | 99/99 |
| `npm run test:e2e` (Playwright: 14 escenarios × escritorio Chromium y Pixel 7 emulado, repetido 2 veces) | 56/56 |

Las pruebas E2E encontraron y se corrigieron fallos reales: en el paso 2, el campo de minutos, el desbordamiento de la calibración en móvil y la falta de cierre de sesión antes de calibrar; en el paso 3, la barra de navegación móvil con 5 secciones ocupaba dos filas y tapaba el botón de terminar sesión.

«Pixel 7 emulado» es emulación de pantalla y táctil en Chromium: **no** equivale a un Android real.

## Limitaciones conocidas
- `npm audit`: 4 avisos moderados de `esbuild` dentro de `drizzle-kit` (solo desarrollo).
- Las fuentes de las fichas no están verificadas todavía (`verified: false`).
- Si se borran los datos del navegador con series sin sincronizar, esas series se pierden.

## Punto de reanudación
Siguiente acción: **paso 4** (móvil y sin conexión): service worker, IndexedDB para la cola, iconos PNG, instalación en Android con HTTPS gratuito, recordatorios y resolución de conflictos entre dispositivos.

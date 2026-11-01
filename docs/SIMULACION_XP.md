# Simulación de la curva de experiencia (reglas game-v1)

Fórmula: `XP_siguiente(L) = round(100 + 30·(L−1) + 5·(L−1)^1,35)`.
Supuestos: cada día del calendario tiene una misión (entrenamiento, recuperación o descanso planificado); completa = 100 XP, parcial = 60 XP de media; hito verificable de 20 XP con la frecuencia indicada; bonificación semanal de 50 XP si se cumple ≥ 80 % de la semana. Reparto determinista, sin azar.

Generado con `npm run sim:xp`:

| Perfil | 30 días | 90 días | 365 días |
|---|---|---|---|
| Constante (90 % completas) | nivel 11 (3060 XP) | nivel 20 (9200 XP) | nivel 40 (37480 XP) |
| Poco tiempo (60 % completas, 25 % parciales) | nivel 9 (2060 XP) | nivel 16 (6180 XP) | nivel 32 (25100 XP) |
| Con pausas (45 % completas) | nivel 7 (1460 XP) | nivel 13 (4420 XP) | nivel 28 (18000 XP) |

## Lectura
- Primer mes con muchos niveles (7–11): refuerzo inicial fuerte sin regalar niveles inmediatos.
- Al año, 28–40 niveles: avanza sin estancarse y la diferencia entre perfiles es moderada, así que tener poco tiempo o pausas no deja atrás de forma frustrante.
- Los rangos (E→S) no dependen del nivel sino de hitos de campaña y constancia (paso 3), así que el ritmo de niveles no fuerza escalada física.
- Decisión: se mantiene la curva v1. Revisar con datos reales tras el primer arco.

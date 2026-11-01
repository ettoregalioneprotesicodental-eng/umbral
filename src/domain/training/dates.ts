/**
 * Fechas locales del usuario. Los instantes se guardan en UTC; el día de la misión
 * se calcula en el servidor con la zona IANA del perfil, no con el reloj del dispositivo.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" en la zona indicada. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una fecha local "YYYY-MM-DD". */
export function isoWeekday(local: string): number {
  const [y, m, d] = local.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Días naturales entre dos fechas locales. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y!, m! - 1, d!); };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Lunes (fecha local) de la semana que contiene `local`. */
export function weekStart(local: string): string {
  const [y, m, d] = local.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!) - (isoWeekday(local) - 1) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

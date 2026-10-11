/**
 * Время. Все «календарные» границы (месяц, квартал, «полный месяц») считаем по Europe/Berlin (decisions D5).
 * Хранится время в UTC. Функции никогда не читают текущее время сами — `now` приходит параметром.
 */

export const CLUB_TZ = "Europe/Berlin";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface Parts {
  y: number;
  m: number; // 1–12
  d: number;
  h: number;
  min: number;
  s: number;
}

/** Календарные части момента времени по Берлину. */
export function berlinParts(date: Date): Parts {
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") o[p.type] = Number(p.value);
  }
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute, s: o.second };
}

/** Смещение Берлина от UTC (в мс) в данный момент. */
function offsetMs(date: Date): number {
  const p = berlinParts(date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Берлинское «локальное» время -> момент UTC. Месяц 1–12, день может выходить за границы (Date.UTC нормализует). */
export function zonedToUtc(y: number, m: number, d: number, h = 0, min = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetMs(new Date(guess));
  // второй проход — на случай перехода на летнее/зимнее время рядом с guess
  t = guess - offsetMs(new Date(t));
  return new Date(t);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM' по Берлину. */
export function monthKey(date: Date): string {
  const p = berlinParts(date);
  return `${p.y}-${pad(p.m)}`;
}

/** 'YYYY-Qn' по Берлину. */
export function quarterKey(date: Date): string {
  const p = berlinParts(date);
  return `${p.y}-Q${Math.floor((p.m - 1) / 3) + 1}`;
}

export function startOfMonth(date: Date): Date {
  const p = berlinParts(date);
  return zonedToUtc(p.y, p.m, 1);
}

export function startOfNextMonth(date: Date): Date {
  const p = berlinParts(date);
  return zonedToUtc(p.y, p.m + 1, 1);
}

export function startOfQuarter(date: Date): Date {
  const p = berlinParts(date);
  return zonedToUtc(p.y, Math.floor((p.m - 1) / 3) * 3 + 1, 1);
}

export function startOfNextQuarter(date: Date): Date {
  const p = berlinParts(date);
  return zonedToUtc(p.y, Math.floor((p.m - 1) / 3) * 3 + 4, 1);
}

/** Начало недели: понедельник 00:00 по Берлину. */
export function startOfWeek(date: Date): Date {
  const p = berlinParts(date);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = воскресенье
  return zonedToUtc(p.y, p.m, p.d - ((dow + 6) % 7));
}

/** Ключ месяца -> начало месяца (UTC-момент полуночи по Берлину). */
export function monthKeyToStart(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return zonedToUtc(y, m, 1);
}

/** Предыдущий месяц в виде ключа. */
export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86_400_000);
}

export function addHours(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 3_600_000);
}

/** Прибавить календарные месяцы по Берлину; день обрезается до длины месяца (31 янв + 1 мес = 28 фев). */
export function addMonths(date: Date, n: number): Date {
  const p = berlinParts(date);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return zonedToUtc(y, m, Math.min(p.d, lastDay), p.h, p.min);
}

/** Сколько ПОЛНЫХ календарных месяцев прошло от `from` до `to` (0, если to ≤ from). */
export function fullMonthsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  const a = berlinParts(from);
  const b = berlinParts(to);
  let k = (b.y - a.y) * 12 + (b.m - a.m);
  if (k < 0) return 0;
  while (k > 0 && addMonths(from, k).getTime() > to.getTime()) k--;
  return k;
}

export const toIso = (d: Date) => d.toISOString();
export const fromIso = (s: string) => new Date(s);

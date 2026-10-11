/** Форматирование для экранов. Чистые функции — можно звать и на сервере, и в браузере. */
const TZ = "Europe/Berlin";

const dm = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short" });
const dmy = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const dmhm = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const wd = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, weekday: "short" });

export const fmtDay = (iso: string | Date) => dm.format(new Date(iso)).replace(".", "");
export const fmtDayFull = (iso: string | Date) => dmy.format(new Date(iso));
export const fmtDayTime = (iso: string | Date) => dmhm.format(new Date(iso)).replace(".", "");
export const fmtWeekday = (iso: string | Date) => wd.format(new Date(iso)).replace(".", "");

/** Сколько полных суток до даты (минимум 0). */
export function daysLeft(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000));
}

/** Склонение: plural(3, "день", "дня", "дней") -> "дня" */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;

export const STATUS_LABEL: Record<string, string> = {
  candidate: "Кандидат",
  probation: "Испытательный месяц",
  member: "Участник",
  partner: "Партнёр",
  council: "Совет",
  stopped: "Остановился",
  paused: "Пауза",
  left: "Вышел",
  expelled: "Исключён",
};

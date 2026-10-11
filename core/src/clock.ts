/**
 * Виртуальные часы заглушки («машина времени»): сдвиг хранится в данных.
 * Нужны, чтобы проверять сроки — 14 дней на встречу, конец испытательного месяца, месячный отчёт — не дожидаясь их.
 * В боевой версии сдвига нет: часы = реальное время.
 */
import type { Store } from "./store/store";

const KEY = "clock_offset_ms";

export function clockNow(store: Store): Date {
  const off = typeof store.meta[KEY] === "number" ? (store.meta[KEY] as number) : 0;
  return new Date(Date.now() + off);
}

export function advanceClock(store: Store, ms: number): Date {
  store.meta[KEY] = (typeof store.meta[KEY] === "number" ? (store.meta[KEY] as number) : 0) + ms;
  (store as unknown as { touch?: () => void }).touch?.();
  return clockNow(store);
}

export function resetClock(store: Store): void {
  store.meta[KEY] = 0;
  (store as unknown as { touch?: () => void }).touch?.();
}

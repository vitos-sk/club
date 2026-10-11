import { describe, expect, it } from "vitest";
import { median, percentile, runSimulation } from "../src/simulation";

describe("статистика", () => {
  it("median и percentile (линейная интерполяция)", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
  });
});

describe("симуляция Пульса: 40 честных, кольцо из 5, 8 неактивных, 12 месяцев", () => {
  it("детерминирована: один seed — одни и те же числа", () => {
    const a = runSimulation({ seed: 7 });
    const b = runSimulation({ seed: 7 });
    expect(a.honest).toEqual(b.honest);
    expect(a.ring).toEqual(b.ring);
  });

  it("состав групп и шкала 0–100", () => {
    const r = runSimulation({ seed: 1 });
    expect(r.honest).toHaveLength(40);
    expect(r.ring).toHaveLength(5);
    expect(r.inactive).toHaveLength(8);
    for (const v of [...r.honest, ...r.ring, ...r.inactive]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("неактивные получают 0", () => {
    expect(runSimulation({ seed: 1 }).inactive.every((v) => v === 0)).toBe(true);
  });

  it("УСЛОВИЕ ПРОХОЖДЕНИЯ: медиана кольца ниже нижней квартили честных — на 25 разных seed", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = runSimulation({ seed });
      expect(r.stats.ringMedian, `seed ${seed}`).toBeLessThan(r.stats.honestQ1);
    }
  });

  it("медиана кольца вдвое ниже медианы честных, даже при оценке «6» и подтверждениях каждый месяц", () => {
    const r = runSimulation({ seed: 3 });
    expect(r.stats.ringMedian).toBeLessThan(r.stats.honestMedian / 2);
  });

  it("кольцо, которое ещё и встречается с честными (накачка «Связей»), остаётся ниже медианы честных", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = runSimulation({ seed, ringMeetsHonest: true });
      expect(r.stats.ringMedian, `seed ${seed}`).toBeLessThan(r.stats.honestMedian);
    }
  });
});

import { describe, expect, it } from "vitest";
import { PULSE_V1 } from "../src/config";
import { computeGrants, formulaAt, isOnline, pulse } from "../src/pulse";
import type { Grade, Help, Meeting, PulseFormulaVersion, PulseParams } from "../src/types";

let seq = 0;
const help = (helper: string, receiver: string, at: string, grade: Grade = 6): Help => ({
  id: `h${++seq}`,
  helper_id: helper,
  receiver_id: receiver,
  sphere_id: "s1",
  grade,
  review: "",
  request_id: null,
  created_at: at,
  confirmed_at: at,
});

const meeting = (a: string, b: string, at: string, both = true): Meeting => ({
  id: `m${++seq}`,
  a_id: a,
  b_id: b,
  request_id: null,
  via_credit: false,
  a_confirmed: true,
  b_confirmed: both,
  is_first: null,
  created_at: at,
  met_at: both ? at : null,
});

const P = PULSE_V1;
const calc = (helps: Help[], who: string, at: string, meetings: Meeting[] = [], params: PulseParams = P) =>
  pulse({ helps, meetings }, who, new Date(at), params);

describe("Пульс: базовые баллы", () => {
  it("мелочь 1, серьёзно 3, изменило ситуацию 6 — от разных людей складываются", () => {
    const t = "2026-03-10T10:00:00Z";
    const r = calc([help("H", "A", t, 1), help("H", "B", t, 3), help("H", "C", t, 6)], "H", t);
    expect(r.raw_sum).toBeCloseTo(10, 10);
  });

  it("помощь, где человек получатель, ему баллов не даёт", () => {
    const t = "2026-03-10T10:00:00Z";
    const r = calc([help("X", "H", t, 6)], "H", t);
    expect(r.raw_sum).toBe(0);
    expect(r.value).toBe(0);
  });

  it("без истории Пульс = 0", () => {
    expect(calc([], "H", "2026-03-10T10:00:00Z").value).toBe(0);
  });

  it("помощь после даты расчёта не учитывается", () => {
    const r = calc([help("H", "A", "2026-04-10T10:00:00Z")], "H", "2026-03-10T10:00:00Z");
    expect(r.raw_sum).toBe(0);
  });
});

describe("Пульс: защита «повторы 1/n»", () => {
  it("n-е подтверждение от того же человека за 12 месяцев даёт балл × 1/n: 6, 3, 2 (до потолка пары)", () => {
    const helps = [
      help("H", "R", "2026-01-10T10:00:00Z"),
      help("H", "R", "2026-01-11T10:00:00Z"),
      help("H", "R", "2026-01-12T10:00:00Z"),
    ];
    const g = computeGrants(helps, P);
    expect(helps.map((h) => g.get(h.id)!.points)).toEqual([6, 3, 2].map((x) => expect.closeTo(x, 10)));
  });

  it("в итоговой сумме (ниже потолка 8): оценка 3 → 3 + 1,5 + 1 = 5,5", () => {
    const helps = [
      help("H", "R", "2026-01-10T10:00:00Z", 3),
      help("H", "R", "2026-01-11T10:00:00Z", 3),
      help("H", "R", "2026-01-12T10:00:00Z", 3),
    ];
    expect(calc(helps, "H", "2026-01-12T10:00:00Z").raw_sum).toBeCloseTo(5.5, 10);
  });

  it("окно скользящее: через 13 месяцев счёт n начинается заново", () => {
    const helps = [help("H", "R", "2025-01-10T10:00:00Z"), help("H", "R", "2026-02-10T10:00:00Z")];
    const g = computeGrants(helps, P);
    expect(g.get(helps[1].id)!.n).toBe(1);
    // первое: 13 полных месяцев затухания 0.9^13 × 6, второе: 6
    expect(calc(helps, "H", "2026-02-10T10:00:00Z").raw_sum).toBeCloseTo(6 * 0.9 ** 13 + 6, 10);
  });

  it("повторы от РАЗНЫХ людей не делятся", () => {
    const t = "2026-01-12T10:00:00Z";
    const helps = [help("H", "A", t), help("H", "B", t), help("H", "C", t)];
    expect(calc(helps, "H", t).raw_sum).toBeCloseTo(18, 10);
  });
});

describe("Пульс: защита «взаимность × 0,25»", () => {
  const rToH = help("R", "H", "2026-01-05T10:00:00Z"); // H подтвердил помощь от R
  const hToR = help("H", "R", "2026-01-10T10:00:00Z"); // R подтверждает помощь от H — обратное направление

  it("обратное подтверждение умножается на 0,25: 6 → 1,5", () => {
    expect(calc([rToH, hToR], "H", "2026-01-10T10:00:00Z").raw_sum).toBeCloseTo(1.5, 10);
  });

  it("первое направление остаётся полным: у R его помощь = 6", () => {
    expect(calc([rToH, hToR], "R", "2026-01-10T10:00:00Z").raw_sum).toBeCloseTo(6, 10);
  });

  it("если встречное подтверждение старше 12 месяцев — штрафа нет", () => {
    const old = help("R", "H", "2024-12-01T10:00:00Z");
    expect(calc([old, hToR], "H", "2026-01-10T10:00:00Z").raw_sum).toBeCloseTo(6, 10);
  });

  it("взаимность перемножается с повторами: второе подтверждение 6 × 1/2 × 0,25 = 0,75", () => {
    const h2 = help("H", "R", "2026-01-20T10:00:00Z");
    const g = computeGrants([rToH, hToR, h2], P);
    expect(g.get(h2.id)!.points).toBeCloseTo(0.75, 10);
  });
});

describe("Пульс: защита «потолок пары 8»", () => {
  const t = (d: number) => `2026-01-${String(d).padStart(2, "0")}T10:00:00Z`;

  it("от одного человека не больше 8: 6 + 3 + 2 + 1,5 = 12,5 → 8 (последовательно: 6, 2, 0, 0)", () => {
    const helps = [help("H", "R", t(10)), help("H", "R", t(11)), help("H", "R", t(12)), help("H", "R", t(13))];
    const g = computeGrants(helps, P);
    expect(helps.map((h) => g.get(h.id)!.capped)).toEqual([6, 2, 0, 0].map((x) => expect.closeTo(x, 10)));
    expect(calc(helps, "H", t(13)).raw_sum).toBeCloseTo(8, 10);
  });

  it("потолок считается по каждому получателю отдельно: два получателя — до 16", () => {
    const helps = [
      help("H", "A", t(10)), help("H", "A", t(11)), help("H", "A", t(12)), help("H", "A", t(13)),
      help("H", "B", t(10)), help("H", "B", t(11)), help("H", "B", t(12)), help("H", "B", t(13)),
    ];
    expect(calc(helps, "H", t(13)).raw_sum).toBeCloseTo(16, 10);
  });

  it("после выхода старых подтверждений из 12-месячного окна потолок освобождается", () => {
    // 6 + 2 набрано в январе 2025; в феврале 2026 окно пустое → новое подтверждение полное
    const old = [help("H", "R", "2025-01-10T10:00:00Z"), help("H", "R", "2025-01-11T10:00:00Z"), help("H", "R", "2025-01-12T10:00:00Z")];
    const fresh = help("H", "R", "2026-02-10T10:00:00Z");
    const g = computeGrants([...old, fresh], P);
    expect(g.get(fresh.id)!.capped).toBeCloseTo(6, 10);
  });

  it("режим proportional: общий вклад пары в окне ужимается до 8 пропорционально", () => {
    const helps = [help("H", "R", t(10)), help("H", "R", t(11)), help("H", "R", t(12)), help("H", "R", t(13))];
    const r = calc(helps, "H", t(13), [], { ...P, pair_cap_mode: "proportional" });
    expect(r.raw_sum).toBeCloseTo(8, 10);
  });
});

describe("Пульс: затухание × 0,9 за полный месяц", () => {
  const h = [help("H", "R", "2026-01-15T10:00:00Z")];
  it("3 полных месяца → 6 × 0,9³", () => {
    expect(calc(h, "H", "2026-04-15T10:00:00Z").raw_sum).toBeCloseTo(6 * 0.9 ** 3, 10);
  });
  it("не дошло до полного месяца → не затухает", () => {
    expect(calc(h, "H", "2026-02-14T10:00:00Z").raw_sum).toBeCloseTo(6, 10);
  });
  it("затухает каждое подтверждение по своей дате", () => {
    const hs = [help("H", "A", "2026-01-15T10:00:00Z"), help("H", "B", "2026-03-15T10:00:00Z")];
    expect(calc(hs, "H", "2026-04-15T10:00:00Z").raw_sum).toBeCloseTo(6 * 0.9 ** 3 + 6 * 0.9, 10);
  });
});

describe("Пульс: защита «разнообразие»", () => {
  const t = "2026-03-10T10:00:00Z";

  it("один партнёр: множитель 1/6", () => {
    const r = calc([help("H", "A", t)], "H", t);
    expect(r.eff_partners).toBeCloseTo(1, 10);
    expect(r.adjusted_sum).toBeCloseTo(6 / 6, 10);
  });

  it("два равных партнёра: множитель 2/6", () => {
    const r = calc([help("H", "A", t), help("H", "B", t)], "H", t);
    expect(r.eff_partners).toBeCloseTo(2, 10);
    expect(r.adjusted_sum).toBeCloseTo(12 * (2 / 6), 10);
  });

  it("неравные доли 75/25: eff = exp(энтропия) ≈ 1,7548", () => {
    // A: 3 балла, B: 1 балл → p = 0.75 / 0.25
    const r = calc([help("H", "A", t, 3), help("H", "B", t, 1)], "H", t);
    const H = -(0.75 * Math.log(0.75) + 0.25 * Math.log(0.25));
    expect(r.eff_partners).toBeCloseTo(Math.exp(H), 10);
    expect(r.eff_partners).toBeCloseTo(1.7548, 3);
    expect(r.adjusted_sum).toBeCloseTo(4 * (Math.exp(H) / 6), 10);
  });

  it("6 и больше равных партнёров: множитель не больше 1", () => {
    const hs = ["A", "B", "C", "D", "E", "F", "G", "I"].map((x) => help("H", x, t));
    const r = calc(hs, "H", t);
    expect(r.adjusted_sum).toBeCloseTo(r.raw_sum, 10);
  });
});

describe("Пульс: Вклад, Связи и итог", () => {
  const t = "2026-03-10T10:00:00Z";
  const sixHelps = ["A", "B", "C", "D", "E", "F"].map((x) => help("H", x, t)); // 36 баллов, eff = 6

  it("Вклад = min(1, сумма / 35)", () => {
    expect(calc(sixHelps, "H", t).contribution).toBe(1);
    const three = ["A", "B", "C", "D", "E", "F"].map((x) => help("H", x, t, 3)); // 18, eff 6
    expect(calc(three, "H", t).contribution).toBeCloseTo(18 / 35, 10);
  });

  it("Связи: разные люди с первой встречей за 6 месяцев, /8", () => {
    const ms = ["A", "B", "C", "D"].map((x) => meeting("H", x, "2026-02-01T10:00:00Z"));
    expect(calc([], "H", t, ms).connections).toBeCloseTo(0.5, 10);
  });

  it("повторная встреча с тем же человеком новой связью не считается", () => {
    const ms = [meeting("H", "A", "2026-01-01T10:00:00Z"), meeting("A", "H", "2026-02-01T10:00:00Z")];
    expect(calc([], "H", t, ms).connections).toBeCloseTo(1 / 8, 10);
  });

  it("если первая встреча пары была больше 6 месяцев назад, новая встреча её «первой» не делает", () => {
    const ms = [meeting("H", "A", "2025-06-01T10:00:00Z"), meeting("H", "A", "2026-02-01T10:00:00Z")];
    expect(calc([], "H", t, ms).connections).toBe(0);
  });

  it("встреча без подтверждения второй стороны не считается", () => {
    const ms = [meeting("H", "A", "2026-02-01T10:00:00Z", false)];
    expect(calc([], "H", t, ms).connections).toBe(0);
  });

  it("встреча считается и когда человек записан как b", () => {
    const ms = [meeting("A", "H", "2026-02-01T10:00:00Z")];
    expect(calc([], "H", t, ms).connections).toBeCloseTo(1 / 8, 10);
  });

  it("Связи не больше 1", () => {
    const ms = "ABCDEFGHIJ".split("").map((x) => meeting("H", x, "2026-02-01T10:00:00Z"));
    expect(calc([], "H", t, ms).connections).toBe(1);
  });

  it("итог = round(75 × Вклад + 25 × Связи): 75 + 12,5 = 87,5 → 88", () => {
    const ms = ["A", "B", "C", "D"].map((x) => meeting("H", x, "2026-02-01T10:00:00Z"));
    expect(calc(sixHelps, "H", t, ms).value).toBe(88);
  });

  it("шкала 0–100", () => {
    const ms = "ABCDEFGHIJ".split("").map((x) => meeting("H", x, "2026-02-01T10:00:00Z"));
    expect(calc(sixHelps, "H", t, ms).value).toBe(100);
  });
});

describe("«На связи» (движение — флаг, а не баллы)", () => {
  const now = new Date("2026-03-10T10:00:00Z");
  const data = (over: Partial<Parameters<typeof isOnline>[0]> = {}) => ({ helps: [], meetings: [], responses: [], ...over });

  it("помощь за 30 дней → на связи (и как помощник, и как получатель)", () => {
    expect(isOnline(data({ helps: [help("H", "A", "2026-03-01T10:00:00Z")] }), "H", now, 30)).toBe(true);
    expect(isOnline(data({ helps: [help("H", "A", "2026-03-01T10:00:00Z")] }), "A", now, 30)).toBe(true);
  });
  it("подтверждённая встреча за 30 дней → на связи", () => {
    expect(isOnline(data({ meetings: [meeting("H", "A", "2026-03-01T10:00:00Z")] }), "H", now, 30)).toBe(true);
  });
  it("отклик на запрос за 30 дней → на связи", () => {
    const responses = [{ id: "x", request_id: "r", responder_id: "H", message: "", mode: "help" as const, is_chosen: false, created_at: "2026-03-01T10:00:00Z" }];
    expect(isOnline(data({ responses }), "H", now, 30)).toBe(true);
  });
  it("старше 30 дней и неподтверждённая встреча → не на связи", () => {
    expect(isOnline(data({ helps: [help("H", "A", "2026-01-01T10:00:00Z")] }), "H", now, 30)).toBe(false);
    expect(isOnline(data({ meetings: [meeting("H", "A", "2026-03-01T10:00:00Z", false)] }), "H", now, 30)).toBe(false);
  });
});

describe("Версии формулы", () => {
  const v = (version: number, from: string, ref: string | null, over: Partial<PulseParams> = {}): PulseFormulaVersion => ({
    id: String(version),
    version,
    effective_from: from,
    decision_ref: ref,
    params: { ...P, ...over },
    created_at: from,
  });

  it("действует последняя версия, вступившая в силу к дате", () => {
    const vs = [v(1, "2026-01-01T00:00:00Z", null), v(2, "2026-04-01T00:00:00Z", "решение №1", { pair_cap: 10 })];
    expect(formulaAt(vs, new Date("2026-03-31T00:00:00Z")).version).toBe(1);
    expect(formulaAt(vs, new Date("2026-04-02T00:00:00Z")).version).toBe(2);
  });

  it("версия без ссылки на решение Совета не вступает в силу", () => {
    const vs = [v(1, "2026-01-01T00:00:00Z", null), v(2, "2026-04-01T00:00:00Z", null, { pair_cap: 10 })];
    expect(formulaAt(vs, new Date("2026-05-01T00:00:00Z")).version).toBe(1);
  });
});

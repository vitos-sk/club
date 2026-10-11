/**
 * Симуляция Пульса (раздел 10 инструкции): 40 честных, кольцо из 5, 8 неактивных, 12 месяцев.
 *
 * Допущения модели (в контексте проекта они не описаны, поэтому зафиксированы здесь и в отчёте):
 *  — честный помогает с частотой λ ~ U(0,3; 2,5) раз в месяц (Пуассон); получатель — случайный другой честный;
 *    оценки 50 / 35 / 15 % → 1 / 3 / 6;
 *  — честный раз в месяц встречается с одним случайным честным (закон «новая связь в месяц»);
 *  — кольцо: в КАЖДОМ месяце КАЖДЫЙ подтверждает КАЖДОГО из остальных четырёх на «6» (самая жёсткая атака),
 *    члены кольца встречаются друг с другом; опционально ещё и раз в месяц встречаются с честными;
 *  — неактивные не делают ничего.
 */
import { PULSE_V1 } from "./config";
import { computeGrants, pulse } from "./pulse";
import { addDays, addMonths, zonedToUtc } from "./time";
import type { Grade, Help, Meeting, PulseParams } from "./types";

export interface SimOptions {
  seed: number;
  months?: number;
  honest?: number;
  ring?: number;
  inactive?: number;
  /** Сколько новых встреч в месяц у честного. */
  honestMeetingsPerMonth?: number;
  /** Кольцо ещё и встречается с честными (раз в месяц, как честные). */
  ringMeetsHonest?: boolean;
  ringGrade?: Grade;
  params?: PulseParams;
}

export interface SimResult {
  honest: number[];
  ring: number[];
  inactive: number[];
  stats: { honestMedian: number; honestQ1: number; ringMedian: number; inactiveMedian: number };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function percentile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (v: number[]) => percentile(v, 0.5);

export function runSimulation(o: SimOptions): SimResult {
  const rnd = mulberry32(o.seed);
  const months = o.months ?? 12;
  const nH = o.honest ?? 40;
  const nR = o.ring ?? 5;
  const nI = o.inactive ?? 8;
  const meetRate = o.honestMeetingsPerMonth ?? 1;
  const params = o.params ?? PULSE_V1;
  const ringGrade = o.ringGrade ?? 6;

  const honest = Array.from({ length: nH }, (_, i) => `h${i}`);
  const ring = Array.from({ length: nR }, (_, i) => `r${i}`);
  const inactive = Array.from({ length: nI }, (_, i) => `i${i}`);

  const start = zonedToUtc(2025, 10, 1);
  const end = addMonths(start, months);
  const helps: Help[] = [];
  const meetings: Meeting[] = [];
  let n = 0;

  const when = (month: number) => addDays(addMonths(start, month), Math.floor(rnd() * 28) + rnd() * 0.9);
  const addHelp = (helper: string, receiver: string, grade: Grade, t: Date) =>
    helps.push({
      id: `s${++n}`,
      helper_id: helper,
      receiver_id: receiver,
      sphere_id: "s1",
      grade,
      review: "",
      request_id: null,
      created_at: t.toISOString(),
      confirmed_at: t.toISOString(),
    });
  const addMeeting = (a: string, b: string, t: Date) =>
    meetings.push({
      id: `m${++n}`,
      a_id: a,
      b_id: b,
      request_id: null,
      via_credit: false,
      a_confirmed: true,
      b_confirmed: true,
      is_first: null,
      created_at: t.toISOString(),
      met_at: t.toISOString(),
    });
  const pick = <T>(arr: T[], except?: T) => {
    let x: T;
    do x = arr[Math.floor(rnd() * arr.length)];
    while (x === except);
    return x;
  };
  const gradeRoll = (): Grade => {
    const r = rnd();
    return r < 0.5 ? 1 : r < 0.85 ? 3 : 6;
  };
  const poisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rnd();
    } while (p > L);
    return k - 1;
  };

  const rates = new Map(honest.map((h) => [h, 0.3 + rnd() * 2.2]));

  for (let m = 0; m < months; m++) {
    for (const h of honest) {
      for (let k = poisson(rates.get(h)!); k > 0; k--) addHelp(h, pick(honest, h), gradeRoll(), when(m));
      for (let k = 0; k < Math.ceil(meetRate); k++) if (rnd() < Math.min(1, meetRate - k)) addMeeting(h, pick(honest, h), when(m));
    }
    // кольцо: каждый подтверждает каждого, каждый месяц, на максимальную оценку
    for (const a of ring) for (const b of ring) if (a !== b) addHelp(a, b, ringGrade, when(m));
    if (m === 0) for (const a of ring) for (const b of ring) if (a < b) addMeeting(a, b, when(m));
    if (o.ringMeetsHonest) for (const r of ring) addMeeting(r, pick(honest), when(m));
  }

  const data = { helps: helps.filter((h) => new Date(h.confirmed_at) <= end), meetings };
  const grants = computeGrants(data.helps, params);
  const at = end;
  const score = (id: string) => pulse(data, id, at, params, grants).value;

  const hs = honest.map(score);
  const rs = ring.map(score);
  const is = inactive.map(score);
  return {
    honest: hs,
    ring: rs,
    inactive: is,
    stats: { honestMedian: median(hs), honestQ1: percentile(hs, 0.25), ringMedian: median(rs), inactiveMedian: median(is) },
  };
}

/**
 * Пульс. Чистые функции: на входе история и «сейчас», на выходе число. Ничего не хранится.
 *
 * Трактовка (docs/plan_stage_A.md §5): каждое подтверждение получает очки ОДИН РАЗ — по истории до него
 * (повторы, взаимность, потолок пары); дальше оно только затухает. Это совпадает с «считается из истории»
 * и не даёт прошлым месяцам меняться задним числом.
 */
import { addMonths, fullMonthsBetween } from "./time";
import type { Help, Id, Meeting, PulseFormulaVersion, PulseParams, Response } from "./types";

export interface PulseData {
  helps: Help[];
  meetings: Meeting[];
}

export interface Grant {
  help_id: Id;
  base: number; // шаг 1
  n: number; // номер подтверждения от этого получателя в окне
  reciprocal: boolean; // был ли штраф взаимности
  points: number; // после шагов 1–3
  capped: number; // после потолка пары (режим sequential)
}

export interface PulseResult {
  value: number; // 0..100
  contribution: number; // Вклад 0..1
  connections: number; // Связи 0..1
  raw_sum: number; // сумма после шагов 1–5 (до разнообразия)
  adjusted_sum: number; // после разнообразия
  eff_partners: number;
  partners: number; // число разных получателей с баллами
  new_connections: number; // число людей для Связей
}

const ms = (iso: string) => Date.parse(iso);

/** Порядок «по истории»: время подтверждения, при равенстве — порядок id. */
function sortHelps(helps: Help[]): Help[] {
  return [...helps].sort((a, b) => ms(a.confirmed_at) - ms(b.confirmed_at) || a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** Шаги 1–4 для каждого подтверждения (режим потолка sequential считается здесь же). */
export function computeGrants(helps: Help[], p: PulseParams): Map<Id, Grant> {
  const out = new Map<Id, Grant>();
  const byPair = new Map<string, { t: number; points: number; capped: number }[]>();

  for (const h of sortHelps(helps)) {
    const t = new Date(h.confirmed_at);
    const tMs = t.getTime();
    const key = `${h.helper_id}>${h.receiver_id}`;
    const same = byPair.get(key) ?? [];
    const reverse = byPair.get(`${h.receiver_id}>${h.helper_id}`) ?? [];

    const base = p.grade_points[h.grade];
    const repeatFrom = addMonths(t, -p.repeat_window_months).getTime();
    const n = 1 + same.filter((x) => x.t > repeatFrom).length;
    const recFrom = addMonths(t, -p.reciprocity_window_months).getTime();
    const reciprocal = reverse.some((x) => x.t > recFrom);
    const points = (base / n) * (reciprocal ? p.reciprocity_factor : 1);

    const capFrom = addMonths(t, -p.pair_cap_window_months).getTime();
    const grantedBefore = same.filter((x) => x.t > capFrom).reduce((s, x) => s + x.capped, 0);
    const capped = Math.min(points, Math.max(0, p.pair_cap - grantedBefore));

    out.set(h.id, { help_id: h.id, base, n, reciprocal, points, capped });
    same.push({ t: tMs, points, capped });
    byPair.set(key, same);
  }
  return out;
}

/** Движение: «на связи» — любая реальная активность за последние N дней. Баллов не даёт. */
export function isOnline(
  data: { helps: Help[]; meetings: Meeting[]; responses: Response[] },
  memberId: Id,
  at: Date,
  days: number,
): boolean {
  const from = at.getTime() - days * 86_400_000;
  const to = at.getTime();
  const inWin = (iso: string | null) => {
    if (!iso) return false;
    const t = ms(iso);
    return t > from && t <= to;
  };
  if (data.helps.some((h) => (h.helper_id === memberId || h.receiver_id === memberId) && inWin(h.confirmed_at))) return true;
  if (data.meetings.some((m) => (m.a_id === memberId || m.b_id === memberId) && m.a_confirmed && m.b_confirmed && inWin(m.met_at))) return true;
  return data.responses.some((r) => r.responder_id === memberId && inWin(r.created_at));
}

/** Новые связи: люди, у которых ПЕРВАЯ встреча пары (обе нажали) попала в окно (at − N мес, at]. */
export function newConnections(meetings: Meeting[], memberId: Id, at: Date, windowMonths: number): Id[] {
  const first = new Map<Id, number>(); // партнёр -> самая ранняя подтверждённая встреча пары
  for (const m of meetings) {
    if (!(m.a_confirmed && m.b_confirmed) || !m.met_at) continue;
    if (m.a_id !== memberId && m.b_id !== memberId) continue;
    const other = m.a_id === memberId ? m.b_id : m.a_id;
    const t = ms(m.met_at);
    if (t > at.getTime()) continue;
    const prev = first.get(other);
    if (prev === undefined || t < prev) first.set(other, t);
  }
  const from = addMonths(at, -windowMonths).getTime();
  return [...first.entries()].filter(([, t]) => t > from).map(([id]) => id);
}

export function pulse(
  data: PulseData,
  memberId: Id,
  at: Date,
  p: PulseParams,
  grants?: Map<Id, Grant>,
): PulseResult {
  const g = grants ?? computeGrants(data.helps, p);
  const atMs = at.getTime();
  const mine = data.helps.filter((h) => h.helper_id === memberId && ms(h.confirmed_at) <= atMs);

  // очки каждого подтверждения до затухания
  const pointsOf = new Map<Id, number>();
  if (p.pair_cap_mode === "sequential") {
    for (const h of mine) pointsOf.set(h.id, g.get(h.id)!.capped);
  } else {
    // proportional: внутри окна (at − 12 мес, at] очки пары ужимаются до потолка пропорционально
    const capFrom = addMonths(at, -p.pair_cap_window_months).getTime();
    const sums = new Map<Id, number>();
    for (const h of mine) {
      if (ms(h.confirmed_at) > capFrom) sums.set(h.receiver_id, (sums.get(h.receiver_id) ?? 0) + g.get(h.id)!.points);
    }
    for (const h of mine) {
      const pts = g.get(h.id)!.points;
      const s = sums.get(h.receiver_id) ?? 0;
      const inWindow = ms(h.confirmed_at) > capFrom;
      pointsOf.set(h.id, inWindow && s > p.pair_cap ? (pts * p.pair_cap) / s : pts);
    }
  }

  // затухание и группировка по получателю
  const byPartner = new Map<Id, number>();
  let raw = 0;
  for (const h of mine) {
    const months = fullMonthsBetween(new Date(h.confirmed_at), at);
    const decayed = pointsOf.get(h.id)! * p.decay_per_month ** months;
    if (decayed <= 0) continue;
    raw += decayed;
    byPartner.set(h.receiver_id, (byPartner.get(h.receiver_id) ?? 0) + decayed);
  }

  // разнообразие
  let eff = 0;
  let adjusted = 0;
  if (raw > 0) {
    let H = 0;
    for (const s of byPartner.values()) {
      const pi = s / raw;
      H -= pi * Math.log(pi);
    }
    eff = Math.exp(H);
    adjusted = raw * Math.min(1, eff / p.diversity_target);
  }

  const contribution = Math.min(1, adjusted / p.contribution_divisor);
  const conn = newConnections(data.meetings, memberId, at, p.connections_window_months);
  const connections = Math.min(1, conn.length / p.connections_divisor);
  const value = Math.min(100, Math.max(0, Math.round(p.weight_contribution * contribution + p.weight_connections * connections)));

  return {
    value,
    contribution,
    connections,
    raw_sum: raw,
    adjusted_sum: adjusted,
    eff_partners: eff,
    partners: byPartner.size,
    new_connections: conn.length,
  };
}

/** Версия формулы, действующая на дату. Версия >1 без ссылки на решение Совета не вступает в силу. */
export function formulaAt(versions: PulseFormulaVersion[], at: Date): PulseFormulaVersion {
  const valid = versions
    .filter((v) => v.version === 1 || (v.decision_ref && v.decision_ref.trim() !== ""))
    .filter((v) => ms(v.effective_from) <= at.getTime())
    .sort((a, b) => b.version - a.version);
  if (valid.length === 0) {
    const first = [...versions].sort((a, b) => a.version - b.version)[0];
    if (!first) throw new Error("Нет ни одной версии формулы Пульса");
    return first;
  }
  return valid[0];
}

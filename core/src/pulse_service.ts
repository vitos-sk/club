/**
 * Пульс на данных хранилища: текущий Пульс, версии формулы, месячные снимки, правило «< 20 два месяца подряд».
 */
import { assertStaff } from "./council";
import { computeGrants, formulaAt, pulse, type PulseResult } from "./pulse";
import type { Store } from "./store/store";
import { monthKey, prevMonthKey, startOfMonth, startOfNextQuarter } from "./time";
import { ACTIVE_STATUSES, DomainError, type Id, type Member, type PulseFormulaVersion, type PulseParams } from "./types";

export async function currentPulse(store: Store, at: Date, memberId: Id): Promise<PulseResult> {
  const f = formulaAt(await store.t.pulse_formula_versions.list(), at);
  const [helps, meetings] = await Promise.all([store.t.helps.list(), store.t.meetings.list()]);
  return pulse({ helps, meetings }, memberId, at, f.params);
}

/** Новая версия формулы: только со ссылкой на решение Совета и не раньше начала следующего квартала. */
export async function addFormulaVersion(
  store: Store,
  now: Date,
  input: { by: Id; params: PulseParams; decision_ref: string; effective_from: string },
): Promise<PulseFormulaVersion> {
  await assertStaff(store, now, input.by);
  if (!input.decision_ref.trim()) throw new DomainError("decision_required", "Формулу можно менять только по решению Совета: укажи ссылку на решение.");
  if (Date.parse(input.effective_from) < startOfNextQuarter(now).getTime()) {
    throw new DomainError("frozen", "Формула заморожена на квартал: новая версия вступает в силу не раньше начала следующего квартала.");
  }
  const versions = await store.t.pulse_formula_versions.list();
  const version = versions.reduce((mx, v) => Math.max(mx, v.version), 0) + 1;
  return store.t.pulse_formula_versions.insert({
    version,
    effective_from: input.effective_from,
    decision_ref: input.decision_ref.trim(),
    params: input.params,
    created_at: now.toISOString(),
  });
}

/** Раз в месяц: снимок Пульса за прошедший месяц (на момент начала текущего). Повторный запуск ничего не добавляет. */
export async function takeMonthlySnapshot(store: Store, now: Date): Promise<{ month_key: string; created: number }> {
  const at = startOfMonth(now);
  const key = prevMonthKey(monthKey(now));
  const f = formulaAt(await store.t.pulse_formula_versions.list(), at);
  const [helps, meetings, members, existing] = await Promise.all([
    store.t.helps.list(),
    store.t.meetings.list(),
    store.t.members.list(),
    store.t.pulse_snapshots.list({ month_key: key }),
  ]);
  const grants = computeGrants(helps, f.params);
  let created = 0;
  for (const m of members) {
    if (!ACTIVE_STATUSES.includes(m.status)) continue;
    if (!m.joined_at || Date.parse(m.joined_at) > at.getTime()) continue; // в тот месяц ещё не был в клубе
    if (existing.some((s) => s.member_id === m.id)) continue;
    const r = pulse({ helps, meetings }, m.id, at, f.params, grants);
    await store.t.pulse_snapshots.insert({
      member_id: m.id,
      month_key: key,
      value: r.value,
      contribution: r.contribution,
      connections: r.connections,
      formula_version: f.version,
      created_at: now.toISOString(),
    });
    created++;
  }
  return { month_key: key, created };
}

/**
 * Пульс < порога два месяца подряд → статус stopped и запись «нужен разговор» для Совета. Это не исключение.
 * Тихие месяцы (июль, август, декабрь) не считаются: смотрим на два ближайших «обычных» месяца.
 * Испытательных и тех, у кого нет снимка за один из месяцев, не трогаем.
 */
export async function applyStopRule(store: Store, now: Date): Promise<Member[]> {
  const cfg = await store.getConfig();
  const keys: string[] = [];
  let k = prevMonthKey(monthKey(now));
  for (let guard = 0; keys.length < cfg.pulse_stop_months && guard < 24; guard++) {
    if (!cfg.quiet_months.includes(Number(k.slice(5)))) keys.push(k);
    k = prevMonthKey(k);
  }
  const stopped: Member[] = [];
  for (const m of await store.t.members.list()) {
    if (!ACTIVE_STATUSES.includes(m.status)) continue;
    const snaps = await store.t.pulse_snapshots.list({ member_id: m.id });
    const values = keys.map((key) => snaps.find((s) => s.month_key === key)?.value);
    if (values.some((v) => v === undefined || v >= cfg.pulse_stop_threshold)) continue;
    stopped.push(await store.t.members.update(m.id, { status: "stopped" }));
    await store.t.council_journal.insert({
      kind: "stopped_talk_needed",
      member_id: m.id,
      ref_id: null,
      note: `Пульс ниже ${cfg.pulse_stop_threshold} ${cfg.pulse_stop_months} месяца подряд. Нужен разговор — это не исключение.`,
      created_at: now.toISOString(),
    });
  }
  return stopped;
}

/**
 * Метрики приборной панели (раздел 11 инструкции, пороги — раздел 6 контекста, лежат в config).
 * Месяц — календарный, по Берлину. Июль, август и декабрь — «тихие»: тревога по активности в них не срабатывает.
 * Все цифры — только агрегаты; личных данных и текстов отзывов в отчёте нет.
 */
import { DEFAULT_THRESHOLDS, type Config, type MetricKey, type Threshold } from "./config";
import { memberLabel } from "./members";
import { computeGrants, formulaAt } from "./pulse";
import type { Store } from "./store/store";
import { monthKeyToStart, prevMonthKey, startOfNextQuarter, startOfQuarter } from "./time";
import { ACTIVE_STATUSES, type Application, type Attendance, type CreatorHours, type DutyPing, type EventRow, type FirstHelp, type Help, type Meeting, type Member, type Request, type Response } from "./types";

export type MetricStatus = "норма" | "внимание" | "тревога" | "нет данных";

export interface MetricResult {
  key: MetricKey;
  label: string;
  value: number | null;
  display: string;
  status: MetricStatus;
  quiet: boolean;
  detail: string;
  action: string;
}

export interface MetricsReport {
  month: string;
  quiet: boolean;
  metrics: MetricResult[];
}

const LABELS: Record<MetricKey, string> = {
  active_share: "Доля активных",
  newcomer_first_help: "Новички с первой помощью",
  retention_3m: "Удержание 3 месяца",
  response_48h: "Запросы с откликом за 48 часов",
  closed_requests: "Доля закрытых запросов",
  contribution_concentration: "Концентрация вклада",
  attendance: "Явка на событие",
  mutual_pairs: "Взаимные подтверждения в паре за квартал",
  creator_hours: "Часы создателя в неделю",
  rejection_quota: "Квота отказов в отборе",
};

/** Что делать при тревоге (раздел 6 контекста). */
const ACTIONS: Record<MetricKey, string> = {
  active_share: "личный разговор с каждым неактивным",
  newcomer_first_help: "включить внешний круг, проверить поручителей",
  retention_3m: "опрос ушедших, три вопроса, обязательно",
  response_48h: "усилить дежурного, сузить каталог",
  closed_requests: "каталог шире состава — резать каталог",
  contribution_concentration: "включить «запрос обеспечен вкладом»",
  attendance: "менять день и формат, не содержание",
  mutual_pairs: "аудит пары Советом",
  creator_hours: "раздать ещё роль, остановить набор",
  rejection_quota: "планка отбора упала: отказов меньше трети",
};

const ORDER: MetricKey[] = [
  "active_share",
  "newcomer_first_help",
  "retention_3m",
  "response_48h",
  "closed_requests",
  "contribution_concentration",
  "attendance",
  "mutual_pairs",
  "creator_hours",
  "rejection_quota",
];

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const monthTitle = (key: string) => `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;

interface Data {
  cfg: Config;
  members: Member[];
  helps: Help[];
  meetings: Meeting[];
  responses: Response[];
  requests: Request[];
  pings: DutyPing[];
  events: EventRow[];
  attendance: Attendance[];
  firstHelp: FirstHelp[];
  hours: CreatorHours[];
  apps: Application[];
  grants: Map<string, { capped: number }>;
}

interface Raw {
  value: number | null;
  detail: string;
}

const ms = (iso: string) => Date.parse(iso);
const pct = (x: number) => `${Math.round(x * 100)} %`;

function bounds(month: string): [number, number] {
  const start = monthKeyToStart(month);
  const [y, m] = month.split("-").map(Number);
  const next = monthKeyToStart(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
  return [start.getTime(), next.getTime()];
}
const within = (iso: string | null, [a, b]: [number, number]) => iso != null && ms(iso) >= a && ms(iso) < b;

function activeMembers(d: Data, end: number) {
  return d.members.filter((m) => ACTIVE_STATUSES.includes(m.status) && (!m.joined_at || ms(m.joined_at) < end));
}

function ratio(num: number, den: number, what: string): Raw {
  return den === 0 ? { value: null, detail: "нет данных за месяц" } : { value: num / den, detail: `${num} из ${den} ${what}` };
}

function computeRaw(key: MetricKey, month: string, d: Data): Raw {
  const range = bounds(month);
  const [start, end] = range;
  switch (key) {
    case "active_share": {
      const act = activeMembers(d, end);
      const on = new Set<string>();
      for (const h of d.helps) {
        if (!within(h.confirmed_at, range)) continue;
        on.add(h.helper_id);
        on.add(h.receiver_id);
      }
      for (const m of d.meetings) {
        if (!(m.a_confirmed && m.b_confirmed && within(m.met_at, range))) continue;
        on.add(m.a_id);
        on.add(m.b_id);
      }
      for (const r of d.responses) if (within(r.created_at, range)) on.add(r.responder_id);
      return ratio(act.filter((m) => on.has(m.id)).length, act.length, "участников были активны");
    }
    case "newcomer_first_help": {
      const withFh = new Map(d.firstHelp.map((f) => [f.member_id, f]));
      const newcomers = d.members.filter((m) => within(m.joined_at, range) && withFh.has(m.id));
      const ok = newcomers.filter((m) => {
        const f = withFh.get(m.id)!;
        return f.status === "helped" && f.helped_at != null && ms(f.helped_at) <= ms(m.joined_at!) + 30 * 86_400_000;
      });
      return ratio(ok.length, newcomers.length, "новичков получили первую помощь за 30 дней");
    }
    case "retention_3m": {
      const cohort = prevMonthKey(prevMonthKey(prevMonthKey(month)));
      const cr = bounds(cohort);
      const members = d.members.filter((m) => within(m.joined_at, cr));
      return ratio(members.filter((m) => m.status !== "left" && m.status !== "expelled").length, members.length, `из вступивших в ${monthTitle(cohort)} остались`);
    }
    case "response_48h":
    case "closed_requests": {
      const reqs = d.requests.filter((r) => within(r.created_at, range) && r.status !== "canceled");
      if (key === "closed_requests") return ratio(reqs.filter((r) => r.closed_by_help).length, reqs.length, "запросов закрыты подтверждённой помощью");
      const limit = d.cfg.duty_after_hours * 3_600_000;
      const ok = reqs.filter((r) => {
        const answered = d.responses.some((x) => x.request_id === r.id && ms(x.created_at) - ms(r.created_at) <= limit);
        const pinged = d.pings.filter((p) => p.request_id === r.id).length >= d.cfg.duty_pings_required;
        return answered || pinged;
      });
      return ratio(ok.length, reqs.length, "запросов получили отклик или отметку дежурного за 48 часов");
    }
    case "contribution_concentration": {
      const per = new Map<string, number>();
      for (const h of d.helps) if (within(h.confirmed_at, range)) per.set(h.helper_id, (per.get(h.helper_id) ?? 0) + (d.grants.get(h.id)?.capped ?? 0));
      const pts = [...per.values()].sort((a, b) => b - a);
      const total = pts.reduce((s, x) => s + x, 0);
      if (pts.length === 0 || total === 0) return { value: null, detail: "нет подтверждённой помощи за месяц" };
      const top = Math.max(1, Math.ceil(pts.length * 0.2));
      const share = pts.slice(0, top).reduce((s, x) => s + x, 0) / total;
      return { value: share, detail: `топ-${top} из ${pts.length} помощников дают ${pct(share)} баллов` };
    }
    case "attendance": {
      const evs = d.events.filter((e) => within(e.starts_at, range));
      const active = activeMembers(d, end).length;
      if (evs.length === 0 || active === 0) return { value: null, detail: "в этом месяце событий не было" };
      const shares = evs.map((e) => d.attendance.filter((a) => a.event_id === e.id).length / active);
      return { value: shares.reduce((s, x) => s + x, 0) / shares.length, detail: `событий: ${evs.length}, активных участников: ${active}` };
    }
    case "mutual_pairs": {
      const q: [number, number] = [startOfQuarter(new Date(start)).getTime(), startOfNextQuarter(new Date(start)).getTime()];
      const pairs = new Map<string, { ab: number; ba: number; a: string; b: string }>();
      for (const h of d.helps) {
        if (!within(h.confirmed_at, q)) continue;
        const [a, b] = h.helper_id < h.receiver_id ? [h.helper_id, h.receiver_id] : [h.receiver_id, h.helper_id];
        const p = pairs.get(`${a}|${b}`) ?? { ab: 0, ba: 0, a, b };
        if (h.helper_id === a) p.ab++;
        else p.ba++;
        pairs.set(`${a}|${b}`, p);
      }
      const byId = new Map(d.members.map((m) => [m.id, m]));
      const flagged = [...pairs.values()].filter((p) => p.ab > 0 && p.ba > 0 && p.ab + p.ba > 3);
      const names = flagged.map((p) => `${memberLabelShort(byId.get(p.a))}–${memberLabelShort(byId.get(p.b))}`);
      return { value: flagged.length, detail: flagged.length ? `пары для аудита: ${names.join(", ")}` : "таких пар нет" };
    }
    case "creator_hours": {
      const rows = d.hours.filter((h) => within(h.week_start, range));
      if (rows.length === 0) return { value: null, detail: "часы за месяц не вносили" };
      return { value: rows.reduce((s, r) => s + r.hours, 0) / rows.length, detail: `недель с данными: ${rows.length}` };
    }
    case "rejection_quota": {
      const decided = d.apps.filter((a) => within(a.decided_at, range) && (a.status === "rejected" || a.status === "accepted"));
      return ratio(decided.filter((a) => a.status === "rejected").length, decided.length, "кандидатов получили отказ");
    }
  }
}

const memberLabelShort = (m: Member | undefined) => (m?.number != null ? `№${m.number}` : memberLabel(m));

function format(key: MetricKey, v: number | null): string {
  if (v === null) return "—";
  if (key === "creator_hours") return `${v.toFixed(1).replace(".", ",")} ч`;
  if (key === "mutual_pairs") return String(v);
  return pct(v);
}

const isNorm = (t: Threshold, v: number) => (t.higher_is_better ? v >= t.norm : v <= t.norm);
const isAlarm = (t: Threshold, v: number) => (t.higher_is_better ? v < t.alarm : v > t.alarm);

export async function loadData(store: Store, now: Date, atMonth: string): Promise<Data> {
  const [cfg, members, helps, meetings, responses, requests, pings, events, attendance, firstHelp, hours, apps, versions] = await Promise.all([
    store.getConfig(),
    store.t.members.list(),
    store.t.helps.list(),
    store.t.meetings.list(),
    store.t.responses.list(),
    store.t.requests.list(),
    store.t.duty_pings.list(),
    store.t.events.list(),
    store.t.attendance.list(),
    store.t.first_help.list(),
    store.t.creator_hours.list(),
    store.t.applications.list(),
    store.t.pulse_formula_versions.list(),
  ]);
  const grants = versions.length ? computeGrants(helps, formulaAt(versions, new Date(bounds(atMonth)[1] - 1)).params) : new Map();
  void now;
  return { cfg, members, helps, meetings, responses, requests, pings, events, attendance, firstHelp, hours, apps, grants };
}

export async function computeMetrics(store: Store, now: Date, month: string): Promise<MetricsReport> {
  const d = await loadData(store, now, month);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...d.cfg.thresholds };
  const isQuiet = (k: string) => d.cfg.quiet_months.includes(Number(k.slice(5)));

  const metrics: MetricResult[] = ORDER.map((key) => {
    const thr = thresholds[key];
    const raw = computeRaw(key, month, d);
    const quiet = thr.activity && isQuiet(month);
    let status: MetricStatus;
    if (raw.value === null) status = "нет данных";
    else if (isNorm(thr, raw.value)) status = "норма";
    else if (!isAlarm(thr, raw.value) || quiet) status = "внимание";
    else {
      // нужен ли «стаж» тревоги: несколько месяцев подряд; по активности тихие месяцы пропускаем
      const months = [month];
      let k = month;
      for (let guard = 0; months.length < thr.alarm_months && guard < 36; guard++) {
        k = prevMonthKey(k);
        if (thr.activity && isQuiet(k)) continue;
        months.push(k);
      }
      const all = months.every((mk) => {
        const v = mk === month ? raw.value : computeRaw(key, mk, d).value;
        return v !== null && isAlarm(thr, v);
      });
      status = all ? "тревога" : "внимание";
    }
    return { key, label: LABELS[key], value: raw.value, display: format(key, raw.value), status, quiet, detail: raw.detail, action: ACTIONS[key] };
  });

  return { month, quiet: isQuiet(month), metrics };
}

/** Текст месячного отчёта для создателя и Совета. Без имён и текстов отзывов. */
export function formatReport(r: MetricsReport): string {
  const lines = [`Отчёт клуба за ${monthTitle(r.month)}`];
  if (r.quiet) lines.push("Тихий месяц: тревога по активности не срабатывает.");
  lines.push("");
  for (const m of r.metrics) {
    lines.push(`• ${m.label}: ${m.display} — ${m.status}`);
    lines.push(`  ${m.detail}`);
    if (m.status === "тревога") lines.push(`  Что делать: ${m.action}.`);
  }
  const alarms = r.metrics.filter((m) => m.status === "тревога").length;
  lines.push("");
  lines.push(alarms ? `Тревог: ${alarms}. Разбор — на встрече Совета.` : "Тревог нет.");
  return lines.join("\n");
}

/**
 * CSV-выгрузка четырёх «листов» (заменяют таблицу бота): участники, помощь, встречи, кредиты.
 * Личные данные в выгрузке есть — отдаём только создателю и Совету (проверяется в боте).
 */
import { memberLabel } from "./members";
import type { Store } from "./store/store";

export type Cell = string | number | boolean | null | undefined;

function esc(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export async function allCsv(store: Store): Promise<{ filename: string; content: string }[]> {
  const [members, helps, meetings, ledger, spheres] = await Promise.all([
    store.t.members.list(),
    store.t.helps.list(),
    store.t.meetings.list(),
    store.t.credit_ledger.list(),
    store.t.spheres.list(),
  ]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const label = (id: string | null) => (id ? memberLabel(byId.get(id)) : "");
  const sphere = (id: string) => spheres.find((s) => s.id === id)?.name ?? "";
  const sorted = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => Number(x.id) - Number(y.id));

  const participants = toCsv(
    ["number", "name", "niche", "skills", "status", "sponsor", "joined_at", "paused_until"],
    members
      .slice()
      .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || Number(a.id) - Number(b.id))
      .map((m) => [m.number, m.status === "left" || m.status === "expelled" ? "бывший участник" : m.name, m.niche, m.skills.join("; "), m.status, m.sponsor_id ? label(m.sponsor_id) : "", date(m.joined_at), date(m.paused_until)]),
  );

  const helpsCsv = toCsv(
    ["date", "helper", "receiver", "sphere", "grade", "review"],
    sorted(helps)
      .sort((a, b) => Date.parse(a.confirmed_at) - Date.parse(b.confirmed_at))
      .map((h) => [date(h.confirmed_at), label(h.helper_id), label(h.receiver_id), sphere(h.sphere_id), h.grade, h.review]),
  );

  const meetingsCsv = toCsv(
    ["date", "a", "b", "first", "a_confirmed", "b_confirmed", "via_credit"],
    sorted(meetings).map((m) => [date(m.met_at ?? m.created_at), label(m.a_id), label(m.b_id), m.is_first === null ? "" : m.is_first ? "yes" : "no", m.a_confirmed ? "yes" : "no", m.b_confirmed ? "yes" : "no", m.via_credit ? "yes" : "no"]),
  );

  const credits = members
    .filter((m) => ledger.some((e) => e.member_id === m.id))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))
    .map((m) => {
      const mine = ledger.filter((e) => e.member_id === m.id);
      const granted = mine.filter((e) => e.reason === "grant").length;
      const spent = mine.filter((e) => e.reason === "spend").length;
      return [label(m.id), granted, spent, mine.reduce((s, e) => s + e.delta, 0)];
    });
  const creditsCsv = toCsv(["member", "granted", "spent", "balance"], credits);

  return [
    { filename: "participants.csv", content: participants },
    { filename: "helps.csv", content: helpsCsv },
    { filename: "meetings.csv", content: meetingsCsv },
    { filename: "credits.csv", content: creditsCsv },
  ];
}

/**
 * Дежурный по доске. Ротация раз в неделю (неделя — с понедельника по Берлину).
 * Бот присылает дежурному запросы старше 48 часов без отклика; дежурный отмечает, каким двум людям написал.
 */
import { isInside, requireMember } from "./members";
import type { Store } from "./store/store";
import { startOfWeek } from "./time";
import { AccessError, DomainError, type Id, type Member, type Request } from "./types";

/** Назначить дежурного на неделю, в которую попадает `now`. Повторное назначение заменяет прежнего. */
export async function assignDuty(store: Store, now: Date, memberId: Id): Promise<void> {
  const m = await requireMember(store, memberId);
  if (!isInside(m)) throw new DomainError("not_inside", "Дежурным может быть участник клуба.");
  const week = startOfWeek(now).toISOString();
  const existing = (await store.t.duty_roster.list({ week_start: week }))[0];
  if (existing) await store.t.duty_roster.update(existing.id, { member_id: m.id });
  else await store.t.duty_roster.insert({ week_start: week, member_id: m.id });
}

export async function currentDuty(store: Store, now: Date): Promise<Member | undefined> {
  const row = (await store.t.duty_roster.list({ week_start: startOfWeek(now).toISOString() }))[0];
  return row ? store.t.members.get(row.member_id) : undefined;
}

/** Запросы, которые дежурному надо подтолкнуть. Деликатные в список не попадают. */
export async function hungRequests(store: Store, now: Date): Promise<Request[]> {
  const cfg = await store.getConfig();
  const limit = now.getTime() - cfg.duty_after_hours * 3_600_000;
  const out: Request[] = [];
  for (const r of await store.t.requests.list({ status: "active" })) {
    if (r.is_sensitive || Date.parse(r.created_at) > limit) continue;
    if ((await store.t.responses.list({ request_id: r.id })).length > 0) continue;
    if ((await store.t.duty_pings.list({ request_id: r.id })).length >= cfg.duty_pings_required) continue;
    out.push(r);
  }
  return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export async function recordPing(store: Store, now: Date, input: { request_id: Id; duty_id: Id; pinged_id: Id }) {
  const duty = await currentDuty(store, now);
  if (!duty || duty.id !== input.duty_id) throw new AccessError("Отмечать может только дежурный этой недели.");
  const req = await store.t.requests.get(input.request_id);
  if (!req) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (input.pinged_id === req.author_id) throw new DomainError("author", "Автору запроса писать не нужно: нужны те, кто может помочь.");
  if (input.pinged_id === duty.id) throw new DomainError("self", "Отметь людей, которым ты написал(а) лично.");
  const pinged = await requireMember(store, input.pinged_id);
  if (!isInside(pinged)) throw new DomainError("not_inside", "Этот человек сейчас не в клубе.");
  const dup = await store.t.duty_pings.list({ request_id: req.id, pinged_member_id: pinged.id });
  if (dup.length > 0) throw new DomainError("duplicate_ping", "Этому человеку по этому запросу ты уже писал(а).");
  return store.t.duty_pings.insert({ request_id: req.id, duty_member_id: duty.id, pinged_member_id: pinged.id, created_at: now.toISOString() });
}

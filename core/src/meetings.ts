/**
 * Встречи и запросы встреч (раздел 6 инструкции).
 * Встреча засчитывается кнопкой «встретились» с ОБЕИХ сторон. QR нет.
 */
import { creditBalance, releaseCredit, reserveCredit, spendCredit } from "./credits";
import { isInside, requireMember } from "./members";
import type { Store } from "./store/store";
import { addDays, monthKey, monthKeyToStart } from "./time";
import { DomainError, type Id, type Meeting, type MeetingRequest } from "./types";

const samePair = (m: Meeting, a: Id, b: Id) => (m.a_id === a && m.b_id === b) || (m.a_id === b && m.b_id === a);
const isDone = (m: Meeting) => m.a_confirmed && m.b_confirmed;

async function pairHasMetBefore(store: Store, a: Id, b: Id, exceptMeetingId?: Id): Promise<boolean> {
  const all = await store.t.meetings.list();
  return all.some((m) => m.id !== exceptMeetingId && isDone(m) && samePair(m, a, b));
}

function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface RequestInput {
  from_id: Id;
  to_id: Id;
  uses_credit: boolean;
  purpose: string;
}

export async function requestMeeting(store: Store, now: Date, input: RequestInput) {
  const cfg = await store.getConfig();
  if (input.from_id === input.to_id) throw new DomainError("self", "Встречу с самим собой запросить нельзя.");
  const from = await requireMember(store, input.from_id);
  const to = await requireMember(store, input.to_id);
  if (!isInside(from)) throw new DomainError("not_inside", "Запрашивать встречи могут участники клуба.");
  if (!isInside(to)) throw new DomainError("target_not_inside", "Этот человек сейчас не в клубе.");
  const purpose = input.purpose.trim();
  if (!purpose) throw new DomainError("purpose_required", "Напиши коротко, о чём хочешь поговорить.");

  const open = (await store.t.meeting_requests.list({ from_id: from.id, to_id: to.id })).filter(
    (r) => r.status === "pending" || r.status === "postponed",
  );
  if (open.length > 0) throw new DomainError("duplicate_request", "У тебя уже есть открытый запрос к этому человеку.");

  if (input.uses_credit) {
    const bal = await creditBalance(store, from.id);
    if (bal.available < 1) throw new DomainError("no_credit", "Свободных кредитов нет. Можно попросить встречу без кредита — отказ тогда без последствий.");
  }

  // потолок получателя: не больше N обязательных встреч в месяц, остальные — на следующий
  let counted = monthKey(now);
  let postponedTo: Date | null = null;
  if (input.uses_credit) {
    const theirs = (await store.t.meeting_requests.list({ to_id: to.id, uses_credit: true })).filter((r) => r.status !== "canceled");
    while (theirs.filter((r) => r.counted_month === counted).length >= cfg.receiver_monthly_cap) counted = nextMonthKey(counted);
    if (counted !== monthKey(now)) postponedTo = monthKeyToStart(counted);
  }

  const deadline = addDays(postponedTo ?? now, cfg.meeting_deadline_days);
  const request = await store.t.meeting_requests.insert({
    from_id: from.id,
    to_id: to.id,
    uses_credit: input.uses_credit,
    purpose,
    created_at: now.toISOString(),
    deadline: deadline.toISOString(),
    status: postponedTo ? "postponed" : "pending",
    postponed_to: postponedTo ? postponedTo.toISOString() : null,
    counted_month: counted,
    meeting_id: null,
  });
  if (input.uses_credit) await reserveCredit(store, now, from.id, request.id);

  return {
    request,
    postponed: postponedTo !== null,
    first_meeting_notice: !(await pairHasMetBefore(store, from.id, to.id)),
  };
}

export async function cancelMeetingRequest(store: Store, now: Date, requestId: Id, by: Id): Promise<MeetingRequest> {
  const r = await store.t.meeting_requests.get(requestId);
  if (!r) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (r.from_id !== by) throw new DomainError("not_requester", "Отменить запрос может только тот, кто его создал.");
  if (r.status !== "pending" && r.status !== "postponed") throw new DomainError("closed", "Этот запрос уже закрыт.");
  const upd = await store.t.meeting_requests.update(r.id, { status: "canceled" });
  if (r.uses_credit) await releaseCredit(store, now, r.from_id, r.id);
  return upd;
}

/** Отказаться может только получатель и только от запроса БЕЗ кредита — обязательные встречи не отклоняются. */
export async function declineMeetingRequest(store: Store, _now: Date, requestId: Id, by: Id): Promise<MeetingRequest> {
  const r = await store.t.meeting_requests.get(requestId);
  if (!r) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (r.to_id !== by) throw new DomainError("not_receiver", "Отказаться может только тот, кого просят о встрече.");
  if (r.uses_credit) throw new DomainError("mandatory", "Это обязательная встреча по кредиту: отказаться нельзя, но можно договориться о другом времени.");
  if (r.status !== "pending" && r.status !== "postponed") throw new DomainError("closed", "Этот запрос уже закрыт.");
  return store.t.meeting_requests.update(r.id, { status: "declined" });
}

/** Встреча без запроса: один отмечает «встретились», второй подтверждает. */
export async function startMeeting(store: Store, now: Date, aId: Id, bId: Id) {
  if (aId === bId) throw new DomainError("self", "Встречу с самим собой отметить нельзя.");
  const a = await requireMember(store, aId);
  const b = await requireMember(store, bId);
  if (!isInside(a) || !isInside(b)) throw new DomainError("not_inside", "Встречи отмечают участники клуба.");

  // если второй человек уже отметил встречу со мной — это подтверждение, а не новая встреча
  const all = await store.t.meetings.list();
  const pending = all.find((m) => m.request_id === null && !isDone(m) && samePair(m, aId, bId));
  if (pending) {
    const res = await pressMet(store, now, { meeting_id: pending.id, member_id: aId });
    return { meeting: res.meeting!, first_meeting_notice: false, completed: res.completed };
  }
  const first = !(await pairHasMetBefore(store, aId, bId));
  const meeting = await store.t.meetings.insert({
    a_id: aId,
    b_id: bId,
    request_id: null,
    via_credit: false,
    a_confirmed: true,
    b_confirmed: false,
    is_first: null,
    created_at: now.toISOString(),
    met_at: null,
  });
  return { meeting, first_meeting_notice: first, completed: false };
}

export interface PressInput {
  request_id?: Id;
  meeting_id?: Id;
  member_id: Id;
}

export async function pressMet(store: Store, now: Date, input: PressInput): Promise<{ completed: boolean; meeting: Meeting | null; other_id: Id }> {
  let request: MeetingRequest | undefined;
  let meeting: Meeting | undefined;

  if (input.request_id) {
    request = await store.t.meeting_requests.get(input.request_id);
    if (!request) throw new DomainError("not_found", "Не нашёл такой запрос.");
    if (request.from_id !== input.member_id && request.to_id !== input.member_id) throw new DomainError("not_participant", "Это не твоя встреча.");
    if (request.status === "met") {
      const m = request.meeting_id ? await store.t.meetings.get(request.meeting_id) : undefined;
      return { completed: true, meeting: m ?? null, other_id: request.from_id === input.member_id ? request.to_id : request.from_id };
    }
    if (request.status !== "pending" && request.status !== "postponed") throw new DomainError("closed", "Этот запрос уже закрыт, встреча не засчитывается.");
    if (request.meeting_id) meeting = await store.t.meetings.get(request.meeting_id);
    if (!meeting) {
      meeting = await store.t.meetings.insert({
        a_id: request.from_id,
        b_id: request.to_id,
        request_id: request.id,
        via_credit: request.uses_credit,
        a_confirmed: false,
        b_confirmed: false,
        is_first: null,
        created_at: now.toISOString(),
        met_at: null,
      });
      request = await store.t.meeting_requests.update(request.id, { meeting_id: meeting.id });
    }
  } else if (input.meeting_id) {
    meeting = await store.t.meetings.get(input.meeting_id);
    if (!meeting) throw new DomainError("not_found", "Не нашёл такую встречу.");
    if (meeting.a_id !== input.member_id && meeting.b_id !== input.member_id) throw new DomainError("not_participant", "Это не твоя встреча.");
  } else {
    throw new DomainError("bad_input", "Не указана встреча.");
  }

  const other = meeting.a_id === input.member_id ? meeting.b_id : meeting.a_id;
  if (isDone(meeting)) return { completed: true, meeting, other_id: other };

  const patch = meeting.a_id === input.member_id ? { a_confirmed: true } : { b_confirmed: true };
  const merged = { ...meeting, ...patch };
  if (!isDone(merged)) {
    meeting = await store.t.meetings.update(meeting.id, patch);
    return { completed: false, meeting, other_id: other };
  }

  // нажали обе стороны: встреча состоялась
  const isFirst = !(await pairHasMetBefore(store, meeting.a_id, meeting.b_id, meeting.id));
  meeting = await store.t.meetings.update(meeting.id, { ...patch, met_at: now.toISOString(), is_first: isFirst });
  if (request) {
    await store.t.meeting_requests.update(request.id, { status: "met" });
    if (request.uses_credit) await spendCredit(store, now, request.from_id, request.id);
  }
  return { completed: true, meeting, other_id: other };
}

export interface SweepResult {
  activated: MeetingRequest[];
  missed: MeetingRequest[];
  expired: MeetingRequest[];
}

/** Плановая задача: включает перенесённые запросы, закрывает просроченные (кредит возвращается, пропуск — в журнал Совета). */
export async function sweepMeetingRequests(store: Store, now: Date): Promise<SweepResult> {
  const res: SweepResult = { activated: [], missed: [], expired: [] };
  const all = await store.t.meeting_requests.list();
  for (const r of all) {
    if (r.status === "postponed" && r.postponed_to && Date.parse(r.postponed_to) <= now.getTime()) {
      res.activated.push(await store.t.meeting_requests.update(r.id, { status: "pending" }));
      continue;
    }
    if (r.status === "pending" && Date.parse(r.deadline) < now.getTime()) {
      if (r.uses_credit) {
        res.missed.push(await store.t.meeting_requests.update(r.id, { status: "missed" }));
        await releaseCredit(store, now, r.from_id, r.id);
        await store.t.council_journal.insert({
          kind: "meeting_missed",
          member_id: r.to_id,
          ref_id: r.id,
          note: "Обязательная встреча по кредиту не состоялась к сроку. Кредит вернулся запросившему.",
          created_at: now.toISOString(),
        });
      } else {
        res.expired.push(await store.t.meeting_requests.update(r.id, { status: "expired" }));
      }
    }
  }
  return res;
}

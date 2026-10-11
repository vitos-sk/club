import { describe, expect, it } from "vitest";
import { creditBalance, grantCredit } from "../src/credits";
import { cancelMeetingRequest, declineMeetingRequest, pressMet, requestMeeting, startMeeting, sweepMeetingRequests } from "../src/meetings";
import { addDays } from "../src/time";
import { DomainError } from "../src/types";
import { NOW, addMember, newStore } from "./helpers";

async function setup() {
  const s = await newStore();
  const a = await addMember(s);
  const b = await addMember(s);
  const c = await addMember(s);
  const d = await addMember(s);
  return { s, a, b, c, d };
}

async function giveCredits(s: Awaited<ReturnType<typeof newStore>>, memberId: string, n: number) {
  for (let i = 0; i < n; i++) await grantCredit(s, NOW, memberId, `help${i}`);
}

describe("кредиты: начисление и потолок 4", () => {
  it("подтверждённая помощь даёт 1 кредит", async () => {
    const { s, a } = await setup();
    expect(await grantCredit(s, NOW, a.id, "h1")).toBe(true);
    expect((await creditBalance(s, a.id)).available).toBe(1);
  });

  it("на счету максимум 4: пятый не начисляется", async () => {
    const { s, a } = await setup();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await grantCredit(s, NOW, a.id, `h${i}`));
    expect(results).toEqual([true, true, true, true, false]);
    expect((await creditBalance(s, a.id)).available).toBe(4);
  });

  it("зарезервированные кредиты входят в лимит 4", async () => {
    const { s, a, b } = await setup();
    await giveCredits(s, a.id, 4);
    await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "познакомиться" });
    const bal = await creditBalance(s, a.id);
    expect(bal).toMatchObject({ available: 3, reserved: 1, unspent: 4 });
    expect(await grantCredit(s, NOW, a.id, "hx")).toBe(false);
  });
});

describe("запрос встречи: резерв, списание, возврат", () => {
  it("с кредитом: кредит резервируется сразу, срок = +14 дней", async () => {
    const { s, a, b } = await setup();
    await giveCredits(s, a.id, 2);
    const r = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "обсудить Gewerbe" });
    expect(r.request.status).toBe("pending");
    expect(r.request.deadline).toBe(addDays(NOW, 14).toISOString());
    expect(await creditBalance(s, a.id)).toMatchObject({ available: 1, reserved: 1 });
  });

  it("без кредита: ничего не резервируется и счёт не нужен", async () => {
    const { s, a, b } = await setup();
    const r = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "кофе" });
    expect(r.request.uses_credit).toBe(false);
    expect((await creditBalance(s, a.id)).available).toBe(0);
  });

  it("с кредитом, но кредитов нет → ошибка no_credit", async () => {
    const { s, a, b } = await setup();
    await expect(requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "x" })).rejects.toMatchObject({ code: "no_credit" });
  });

  it("встреча засчитана, когда нажали обе стороны; кредит списан (не вернулся)", async () => {
    const { s, a, b } = await setup();
    await giveCredits(s, a.id, 1);
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "x" });

    const first = await pressMet(s, NOW, { request_id: request.id, member_id: b.id });
    expect(first.completed).toBe(false);
    expect(await creditBalance(s, a.id)).toMatchObject({ available: 0, reserved: 1 }); // ещё в резерве

    const second = await pressMet(s, addDays(NOW, 1), { request_id: request.id, member_id: a.id });
    expect(second.completed).toBe(true);
    expect((await s.t.meeting_requests.get(request.id))!.status).toBe("met");
    expect(await creditBalance(s, a.id)).toMatchObject({ available: 0, reserved: 0, unspent: 0 }); // списан
    const ledger = await s.t.credit_ledger.list({ member_id: a.id });
    expect(ledger.map((e) => e.reason)).toEqual(["grant", "reserve", "spend"]);
  });

  it("повторное нажатие той же стороны ничего не меняет; посторонний нажать не может", async () => {
    const { s, a, b, c } = await setup();
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    await pressMet(s, NOW, { request_id: request.id, member_id: a.id });
    const again = await pressMet(s, NOW, { request_id: request.id, member_id: a.id });
    expect(again.completed).toBe(false);
    await expect(pressMet(s, NOW, { request_id: request.id, member_id: c.id })).rejects.toBeInstanceOf(DomainError);
  });

  it("отмена запроса возвращает кредит", async () => {
    const { s, a, b } = await setup();
    await giveCredits(s, a.id, 1);
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "x" });
    await cancelMeetingRequest(s, NOW, request.id, a.id);
    expect(await creditBalance(s, a.id)).toMatchObject({ available: 1, reserved: 0 });
    expect((await s.t.meeting_requests.get(request.id))!.status).toBe("canceled");
  });

  it("отменить может только тот, кто просил", async () => {
    const { s, a, b } = await setup();
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    await expect(cancelMeetingRequest(s, NOW, request.id, b.id)).rejects.toBeInstanceOf(DomainError);
  });

  it("не встретились к сроку: кредит возвращается, пропуск пишется в журнал Совета на получателя", async () => {
    const { s, a, b } = await setup();
    await giveCredits(s, a.id, 1);
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: true, purpose: "x" });

    const early = await sweepMeetingRequests(s, addDays(NOW, 13));
    expect(early.missed).toHaveLength(0);

    const res = await sweepMeetingRequests(s, addDays(NOW, 15));
    expect(res.missed.map((r) => r.id)).toEqual([request.id]);
    expect(await creditBalance(s, a.id)).toMatchObject({ available: 1, reserved: 0 });
    expect((await s.t.meeting_requests.get(request.id))!.status).toBe("missed");
    const journal = await s.t.council_journal.list();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ kind: "meeting_missed", member_id: b.id, ref_id: request.id });
  });

  it("запрос без кредита истекает молча: без возврата и без записи в журнал", async () => {
    const { s, a, b } = await setup();
    const { request } = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    const res = await sweepMeetingRequests(s, addDays(NOW, 15));
    expect(res.expired.map((r) => r.id)).toEqual([request.id]);
    expect(await s.t.council_journal.list()).toHaveLength(0);
  });

  it("запрос без кредита получатель может отклонить без последствий; с кредитом — нельзя", async () => {
    const { s, a, b, c } = await setup();
    const free = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    await declineMeetingRequest(s, NOW, free.request.id, b.id);
    expect((await s.t.meeting_requests.get(free.request.id))!.status).toBe("declined");
    expect(await s.t.council_journal.list()).toHaveLength(0);

    await giveCredits(s, c.id, 1);
    const paid = await requestMeeting(s, NOW, { from_id: c.id, to_id: b.id, uses_credit: true, purpose: "x" });
    await expect(declineMeetingRequest(s, NOW, paid.request.id, b.id)).rejects.toBeInstanceOf(DomainError);
  });

  it("второй открытый запрос тому же человеку от того же человека — нельзя", async () => {
    const { s, a, b } = await setup();
    await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    await expect(requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "y" })).rejects.toMatchObject({ code: "duplicate_request" });
  });

  it("с самим собой нельзя", async () => {
    const { s, a } = await setup();
    await expect(requestMeeting(s, NOW, { from_id: a.id, to_id: a.id, uses_credit: false, purpose: "x" })).rejects.toBeInstanceOf(DomainError);
  });
});

describe("потолок получателя: 2 обязательные встречи в месяц, лишние переносятся", () => {
  async function fourRequesters() {
    const base = await setup();
    const e = await addMember(base.s);
    const f = await addMember(base.s);
    const requesters = [base.a, base.c, base.d, e, f];
    for (const r of requesters) await giveCredits(base.s, r.id, 1);
    return { ...base, requesters };
  }

  it("третья и дальше уходят на следующий месяц; срок 14 дней считается заново", async () => {
    const { s, b, requesters } = await fourRequesters();
    const made = [];
    for (const r of requesters.slice(0, 4)) {
      made.push(await requestMeeting(s, NOW, { from_id: r.id, to_id: b.id, uses_credit: true, purpose: "x" }));
    }
    expect(made.map((m) => m.request.status)).toEqual(["pending", "pending", "postponed", "postponed"]);
    expect(made[0].request.counted_month).toBe("2026-10");
    expect(made[2].request.counted_month).toBe("2026-11");
    // 1 ноября 2026 00:00 по Берлину (UTC+1) = 31 октября 23:00 UTC
    expect(made[2].request.postponed_to).toBe("2026-10-31T23:00:00.000Z");
    expect(made[2].request.deadline).toBe("2026-11-14T23:00:00.000Z");
  });

  it("пятая тоже в ноябре, если там ещё есть место; шестая — в декабре", async () => {
    const { s, b, requesters } = await fourRequesters();
    const g = await addMember(s);
    await giveCredits(s, g.id, 1);
    const made = [];
    for (const r of [...requesters, g]) made.push(await requestMeeting(s, NOW, { from_id: r.id, to_id: b.id, uses_credit: true, purpose: "x" }));
    expect(made.map((m) => m.request.counted_month)).toEqual(["2026-10", "2026-10", "2026-11", "2026-11", "2026-12", "2026-12"]);
  });

  it("перенесённая встреча при этом сразу резервирует кредит", async () => {
    const { s, b, requesters } = await fourRequesters();
    for (const r of requesters.slice(0, 3)) await requestMeeting(s, NOW, { from_id: r.id, to_id: b.id, uses_credit: true, purpose: "x" });
    expect(await creditBalance(s, requesters[2].id)).toMatchObject({ available: 0, reserved: 1 });
  });

  it("в день переноса запрос становится активным; сообщаем получателю", async () => {
    const { s, b, requesters } = await fourRequesters();
    const made = [];
    for (const r of requesters.slice(0, 3)) made.push(await requestMeeting(s, NOW, { from_id: r.id, to_id: b.id, uses_credit: true, purpose: "x" }));
    const early = await sweepMeetingRequests(s, new Date("2026-10-31T22:00:00Z"));
    expect(early.activated).toHaveLength(0);
    const res = await sweepMeetingRequests(s, new Date("2026-10-31T23:30:00Z"));
    expect(res.activated.map((r) => r.id)).toEqual([made[2].request.id]);
    expect((await s.t.meeting_requests.get(made[2].request.id))!.status).toBe("pending");
  });

  it("отменённый запрос освобождает место в месяце", async () => {
    const { s, b, requesters } = await fourRequesters();
    const m1 = await requestMeeting(s, NOW, { from_id: requesters[0].id, to_id: b.id, uses_credit: true, purpose: "x" });
    await requestMeeting(s, NOW, { from_id: requesters[1].id, to_id: b.id, uses_credit: true, purpose: "x" });
    await cancelMeetingRequest(s, NOW, m1.request.id, requesters[0].id);
    const third = await requestMeeting(s, NOW, { from_id: requesters[2].id, to_id: b.id, uses_credit: true, purpose: "x" });
    expect(third.request.status).toBe("pending");
  });

  it("запросы без кредита в потолок не входят", async () => {
    const { s, b, requesters } = await fourRequesters();
    for (const r of requesters.slice(0, 3)) await requestMeeting(s, NOW, { from_id: r.id, to_id: b.id, uses_credit: false, purpose: "x" });
    const paid = await requestMeeting(s, NOW, { from_id: requesters[3].id, to_id: b.id, uses_credit: true, purpose: "x" });
    expect(paid.request.status).toBe("pending");
  });
});

describe("первая встреча пары", () => {
  it("первая подтверждённая встреча пары помечается is_first, вторая — нет; напоминание про публичное место только до первой", async () => {
    const { s, a, b } = await setup();
    const r1 = await requestMeeting(s, NOW, { from_id: a.id, to_id: b.id, uses_credit: false, purpose: "x" });
    expect(r1.first_meeting_notice).toBe(true);
    await pressMet(s, NOW, { request_id: r1.request.id, member_id: a.id });
    const done = await pressMet(s, NOW, { request_id: r1.request.id, member_id: b.id });
    expect(done.meeting!.is_first).toBe(true);
    expect(done.meeting!.met_at).toBe(NOW.toISOString());

    const later = addDays(NOW, 20);
    const r2 = await requestMeeting(s, later, { from_id: b.id, to_id: a.id, uses_credit: false, purpose: "y" });
    expect(r2.first_meeting_notice).toBe(false);
    await pressMet(s, later, { request_id: r2.request.id, member_id: a.id });
    const done2 = await pressMet(s, later, { request_id: r2.request.id, member_id: b.id });
    expect(done2.meeting!.is_first).toBe(false);
  });

  it("встреча без запроса: один отмечает, второй подтверждает; кредитов она не трогает", async () => {
    const { s, a, b } = await setup();
    const m = await startMeeting(s, NOW, a.id, b.id);
    expect(m.meeting.a_confirmed).toBe(true);
    expect(m.first_meeting_notice).toBe(true);
    const done = await pressMet(s, NOW, { meeting_id: m.meeting.id, member_id: b.id });
    expect(done.completed).toBe(true);
    expect(done.meeting!.is_first).toBe(true);
    expect((await s.t.credit_ledger.list()).length).toBe(0);
  });
});

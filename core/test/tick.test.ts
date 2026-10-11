import { describe, expect, it } from "vitest";
import { createRequest } from "../src/board";
import { assignDuty } from "../src/duty";
import { requestMeeting } from "../src/meetings";
import { tick } from "../src/tick";
import { addDays, addHours } from "../src/time";
import { NOW, addMember, newStore } from "./helpers";

type S = Awaited<ReturnType<typeof newStore>>;
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

async function base() {
  const s = await newStore();
  const creator = await addMember(s, { is_creator: true, status: "council", name: "Создатель" });
  const sphere = (await s.t.spheres.list())[0];
  return { s, creator, sphere };
}
const notes = async (s: S, memberId: string, kind?: string) =>
  (await s.t.notifications.list({ member_id: memberId })).filter((n) => !kind || n.kind === kind);

describe("tick: встречи", () => {
  async function pair() {
    const b = await base();
    const from = await addMember(b.s);
    const to = await addMember(b.s);
    await b.s.t.credit_ledger.insert({ member_id: from.id, delta: 1, reason: "grant", ref_id: null, created_at: ago(1) });
    const { request } = await requestMeeting(b.s, NOW, { from_id: from.id, to_id: to.id, uses_credit: true, purpose: "кофе" });
    return { ...b, from, to, request };
  }

  it("за 3 дня до срока и в день срока напоминает получателю — по одному разу", async () => {
    const { s, to, request } = await pair();
    await tick(s, addDays(NOW, 10));
    expect(await notes(s, to.id, "meeting_reminder")).toHaveLength(0);
    await tick(s, addDays(NOW, 11.5)); // до срока < 3 дней
    await tick(s, addDays(NOW, 11.6));
    expect(await notes(s, to.id, "meeting_reminder")).toHaveLength(1);
    await tick(s, addDays(request.deadline ? new Date(request.deadline) : NOW, -0.2)); // меньше суток
    expect(await notes(s, to.id, "meeting_reminder")).toHaveLength(2);
    await tick(s, addDays(NOW, 13.9));
    expect(await notes(s, to.id, "meeting_reminder")).toHaveLength(2);
  });

  it("срок прошёл: запросившему возвращается кредит и приходит сообщение, получателю — напоминание о пропуске", async () => {
    const { s, from, to } = await pair();
    await tick(s, addDays(NOW, 15));
    expect(await notes(s, from.id, "meeting_missed")).toHaveLength(1);
    expect(await notes(s, to.id, "meeting_missed")).toHaveLength(1);
    expect((await s.t.council_journal.list({ kind: "meeting_missed" }))).toHaveLength(1);
    await tick(s, addDays(NOW, 16));
    expect(await notes(s, from.id, "meeting_missed")).toHaveLength(1);
  });

  it("перенесённая встреча наступила — получатель узнаёт", async () => {
    const b = await base();
    const to = await addMember(b.s);
    const reqs = [];
    for (let i = 0; i < 3; i++) {
      const f = await addMember(b.s);
      await b.s.t.credit_ledger.insert({ member_id: f.id, delta: 1, reason: "grant", ref_id: null, created_at: ago(1) });
      reqs.push(await requestMeeting(b.s, NOW, { from_id: f.id, to_id: to.id, uses_credit: true, purpose: "x" }));
    }
    expect(reqs[2].request.status).toBe("postponed");
    await tick(b.s, new Date("2026-11-01T10:00:00Z"));
    expect(await notes(b.s, to.id, "meeting_activated")).toHaveLength(1);
  });
});

describe("tick: доска и дежурный", () => {
  it("зависший запрос уходит дежурному один раз", async () => {
    const { s, sphere } = await base();
    const duty = await addMember(s);
    const author = await addMember(s);
    const req = await createRequest(s, addHours(NOW, -50), { author_id: author.id, text: "нужна помощь", sphere_id: sphere.id, deadline: addDays(NOW, 5).toISOString(), is_urgent: false, is_sensitive: false, visible_to: [] });
    await assignDuty(s, NOW, duty.id);
    await tick(s, NOW);
    await tick(s, addHours(NOW, 3));
    const n = await notes(s, duty.id, "duty_hung");
    expect(n).toHaveLength(1);
    expect(n[0].link).toContain(req.id);
  });

  it("без дежурного — сообщение создателю «назначь дежурного»", async () => {
    const { s, sphere, creator } = await base();
    const author = await addMember(s);
    await createRequest(s, addHours(NOW, -50), { author_id: author.id, text: "нужна помощь", sphere_id: sphere.id, deadline: addDays(NOW, 5).toISOString(), is_urgent: false, is_sensitive: false, visible_to: [] });
    await tick(s, NOW);
    expect(await notes(s, creator.id, "duty_missing")).toHaveLength(1);
  });

  it("запрос с прошедшим сроком закрывается, автор узнаёт", async () => {
    const { s, sphere } = await base();
    const author = await addMember(s);
    await createRequest(s, NOW, { author_id: author.id, text: "нужна помощь", sphere_id: sphere.id, deadline: addDays(NOW, 2).toISOString(), is_urgent: false, is_sensitive: false, visible_to: [] });
    await tick(s, addDays(NOW, 3));
    expect((await s.t.requests.list({ author_id: author.id }))[0].status).toBe("expired");
    expect(await notes(s, author.id, "request_expired")).toHaveLength(1);
  });
});

describe("tick: испытательный месяц и первая помощь", () => {
  it("срок первой помощи: за 3 дня — новичку, поручителю и создателю; просрочка — запись в журнал и сообщение", async () => {
    const { s, creator } = await base();
    const sponsor = await addMember(s);
    const newbie = await addMember(s, { status: "probation", number: null, sponsor_id: sponsor.id, joined_at: ago(11), probation_until: addDays(NOW, 19).toISOString() });
    await s.t.first_help.insert({ member_id: newbie.id, main_request: "найти юриста", sponsor_id: sponsor.id, talk_deadline: addDays(NOW, 3).toISOString(), status: "pending", helped_at: null, created_at: ago(11) });
    await tick(s, NOW);
    await tick(s, addHours(NOW, 1));
    for (const id of [newbie.id, sponsor.id, creator.id]) expect(await notes(s, id, "first_help_soon")).toHaveLength(1);
    await tick(s, addDays(NOW, 4));
    expect(await s.t.council_journal.list({ kind: "first_help_overdue" })).toHaveLength(1);
    for (const id of [newbie.id, sponsor.id, creator.id]) expect(await notes(s, id, "first_help_overdue")).toHaveLength(1);
    await tick(s, addDays(NOW, 5));
    expect(await s.t.council_journal.list({ kind: "first_help_overdue" })).toHaveLength(1);
  });

  it("первая помощь уже оказана — напоминаний нет", async () => {
    const { s, creator } = await base();
    const newbie = await addMember(s, { status: "probation", number: null, joined_at: ago(11), probation_until: addDays(NOW, 19).toISOString() });
    await s.t.first_help.insert({ member_id: newbie.id, main_request: "x", sponsor_id: null, talk_deadline: addDays(NOW, 1).toISOString(), status: "helped", helped_at: ago(1), created_at: ago(11) });
    await tick(s, addDays(NOW, 5));
    expect(await notes(s, creator.id, "first_help_overdue")).toHaveLength(0);
  });

  it("месяц без помощи закончился: новичок узнаёт о выходе, создатель — тоже; с помощью — создатель получает «пора посвящать»", async () => {
    const { s, creator, sphere } = await base();
    const empty = await addMember(s, { status: "probation", number: null, joined_at: ago(35), probation_until: ago(5) });
    const good = await addMember(s, { status: "probation", number: null, joined_at: ago(35), probation_until: ago(5) });
    const other = await addMember(s);
    await s.t.helps.insert({ helper_id: good.id, receiver_id: other.id, sphere_id: sphere.id, grade: 3, review: "ок", request_id: null, created_at: ago(10), confirmed_at: ago(10) });
    await tick(s, NOW);
    expect(await notes(s, empty.id, "probation_exit")).toHaveLength(1);
    expect(await notes(s, creator.id, "probation_exit")).toHaveLength(1);
    expect(await notes(s, creator.id, "probation_ready")).toHaveLength(1);
    await tick(s, addHours(NOW, 2));
    expect(await notes(s, creator.id, "probation_ready")).toHaveLength(1);
  });
});

describe("tick: Совет и месячные задачи", () => {
  it("срок члена Совета заканчивается — предупреждаем его и создателя один раз", async () => {
    const { s, creator } = await base();
    const c = await addMember(s, { status: "council" });
    await s.t.council_terms.insert({ member_id: c.id, starts_on: ago(340), ends_on: addDays(NOW, 20).toISOString(), term_no: 1, warned_at: null });
    await tick(s, NOW);
    await tick(s, addHours(NOW, 5));
    expect(await notes(s, c.id, "council_term_ending")).toHaveLength(1);
    expect(await notes(s, creator.id, "council_term_ending")).toHaveLength(1);
  });

  it("в начале месяца: снимок Пульса за прошлый, правило «< 20 два месяца» — один раз за месяц", async () => {
    const { s, creator } = await base();
    const weak = await addMember(s);
    await s.t.pulse_snapshots.insert({ member_id: weak.id, month_key: "2026-09", value: 5, contribution: 0, connections: 0, formula_version: 1, created_at: NOW.toISOString() });
    const r = await tick(s, new Date("2026-11-02T08:00:00Z")); // прошлые: октябрь и сентябрь
    expect(r.jobs).toContain("monthly:2026-10");
    // снимок за октябрь создаётся тиком, затем правило смотрит октябрь+сентябрь: у weak в октябре Пульс 0 (<20)
    expect((await s.t.members.get(weak.id))!.status).toBe("stopped");
    expect(await notes(s, creator.id, "stopped_talk")).toHaveLength(1);
    const again = await tick(s, new Date("2026-11-03T08:00:00Z"));
    expect(again.jobs).not.toContain("monthly:2026-10");
    expect(await notes(s, creator.id, "stopped_talk")).toHaveLength(1);
  });
});

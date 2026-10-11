import { describe, expect, it } from "vitest";
import { getPulseFor } from "../src/access";
import { PULSE_V1 } from "../src/config";
import { createRequest } from "../src/board";
import {
  admit,
  admitDirect,
  keepProbation,
  leaveClub,
  probationSweep,
  setFirstHelpStatus,
  signLaws,
} from "../src/lifecycle";
import { linkTelegram, memberLabel } from "../src/members";
import { applyStopRule, addFormulaVersion, takeMonthlySnapshot, currentPulse } from "../src/pulse_service";
import { addDays, startOfNextQuarter } from "../src/time";
import { AccessError, DomainError } from "../src/types";
import { NOW, addMember, newStore } from "./helpers";

const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

async function base() {
  const s = await newStore();
  const creator = await addMember(s, { is_creator: true, name: "Создатель", status: "council" });
  const a1 = await addMember(s, { status: "council", name: "Якорь" });
  await s.t.council_terms.insert({ member_id: a1.id, starts_on: ago(30), ends_on: addDays(NOW, 335).toISOString(), term_no: 1, warned_at: null });
  const sphere = (await s.t.spheres.list())[0];
  return { s, creator, a1, sphere };
}
type Base = Awaited<ReturnType<typeof base>>;

async function probationer(b: Base, joinedDaysAgo = 20, over = {}) {
  return addMember(b.s, { status: "probation", number: null, joined_at: ago(joinedDaysAgo), probation_until: addDays(NOW, 30 - joinedDaysAgo).toISOString(), ...over });
}
async function helpedBy(b: Base, helperId: string, daysAgo: number) {
  const other = await addMember(b.s, { number: null });
  await b.s.t.helps.insert({ helper_id: helperId, receiver_id: other.id, sphere_id: b.sphere.id, grade: 3, review: "ок", request_id: null, created_at: ago(daysAgo), confirmed_at: ago(daysAgo) });
}

describe("посвящение: номер и статус", () => {
  it("после помощи в испытательный месяц: статус member, следующий номер, решение записано", async () => {
    const b = await base();
    const p = await probationer(b);
    await helpedBy(b, p.id, 5);
    const maxNumber = Math.max(...(await b.s.t.members.list()).map((m) => m.number ?? 0));
    const res = await admit(b.s, NOW, { by: b.creator.id, member_id: p.id });
    expect(res.member).toMatchObject({ status: "member", number: maxNumber + 1 });
    expect(res.decision.kind).toBe("initiation");
  });

  it("первые 30 — основатели, 31-й — нет", async () => {
    const b = await base();
    // ровно 29 посвящённых с номерами 1..29
    let n = 1;
    for (const m of await b.s.t.members.list()) await b.s.t.members.update(m.id, { number: null });
    for (const m of await b.s.t.members.list()) await b.s.t.members.update(m.id, { number: n++ });
    while (n <= 29) await addMember(b.s, { number: n++ });

    const p30 = await probationer(b);
    await helpedBy(b, p30.id, 3);
    const r30 = await admit(b.s, NOW, { by: b.creator.id, member_id: p30.id });
    expect(r30.member).toMatchObject({ number: 30, is_founder: true });

    const p31 = await probationer(b);
    await helpedBy(b, p31.id, 3);
    const r31 = await admit(b.s, NOW, { by: b.creator.id, member_id: p31.id });
    expect(r31.member).toMatchObject({ number: 31, is_founder: false });
  });

  it("без подтверждённой помощи за испытательный месяц — нельзя", async () => {
    const b = await base();
    const p = await probationer(b);
    await expect(admit(b.s, NOW, { by: b.creator.id, member_id: p.id })).rejects.toMatchObject({ code: "no_help_yet" });
  });

  it("помощь до начала испытательного месяца не считается", async () => {
    const b = await base();
    const p = await probationer(b, 10);
    await helpedBy(b, p.id, 15);
    await expect(admit(b.s, NOW, { by: b.creator.id, member_id: p.id })).rejects.toMatchObject({ code: "no_help_yet" });
  });

  it("получатель помощи, но не помощник — не считается", async () => {
    const b = await base();
    const p = await probationer(b);
    const other = await addMember(b.s);
    await b.s.t.helps.insert({ helper_id: other.id, receiver_id: p.id, sphere_id: b.sphere.id, grade: 3, review: "ок", request_id: null, created_at: ago(3), confirmed_at: ago(3) });
    await expect(admit(b.s, NOW, { by: b.creator.id, member_id: p.id })).rejects.toMatchObject({ code: "no_help_yet" });
  });

  it("посвящает только создатель или Совет; только из испытательного; поручитель по «своим» не решает", async () => {
    const b = await base();
    const p = await probationer(b, 20, { sponsor_id: b.a1.id });
    await helpedBy(b, p.id, 5);
    const plain = await addMember(b.s);
    await expect(admit(b.s, NOW, { by: plain.id, member_id: p.id })).rejects.toBeInstanceOf(AccessError);
    await expect(admit(b.s, NOW, { by: b.a1.id, member_id: p.id })).rejects.toMatchObject({ code: "recused" });
    await expect(admit(b.s, NOW, { by: b.creator.id, member_id: plain.id })).rejects.toBeInstanceOf(DomainError);
  });

  it("подпись законов отмечается", async () => {
    const b = await base();
    const m = await addMember(b.s);
    const r = await signLaws(b.s, NOW, { by: b.creator.id, member_id: m.id });
    expect(r.laws_signed_at).toBe(NOW.toISOString());
    const plain = await addMember(b.s);
    await expect(signLaws(b.s, NOW, { by: plain.id, member_id: m.id })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("первые участники без анкеты (прямое принятие)", () => {
  it("создаёт участника с номером, пишет в журнал Совета", async () => {
    const b = await base();
    const m = await admitDirect(b.s, NOW, { by: b.creator.id, tg_username: "@Ivan_Core", name: "Иван", reason: "ядро клуба" });
    expect(m).toMatchObject({ status: "member", name: "Иван", tg_username: "ivan_core", tg_user_id: null });
    expect(m.number).toBeGreaterThan(0);
    const j = await b.s.t.council_journal.list({ kind: "direct_admit" });
    expect(j).toHaveLength(1);
    expect(j[0].member_id).toBe(m.id);
  });

  it("при первом входе в бота ник связывается с Telegram id", async () => {
    const b = await base();
    const m = await admitDirect(b.s, NOW, { by: b.creator.id, tg_username: "ivan_core", name: "Иван", reason: "ядро" });
    const linked = await linkTelegram(b.s, { tg_user_id: 4242, tg_username: "Ivan_Core" });
    expect(linked?.id).toBe(m.id);
    expect((await b.s.t.members.get(m.id))!.tg_user_id).toBe(4242);
    expect((await linkTelegram(b.s, { tg_user_id: 4242, tg_username: "другой" }))?.id).toBe(m.id);
    expect(await linkTelegram(b.s, { tg_user_id: 999, tg_username: "никто" })).toBeUndefined();
  });

  it("только создатель или Совет", async () => {
    const b = await base();
    const plain = await addMember(b.s);
    await expect(admitDirect(b.s, NOW, { by: plain.id, tg_username: "x", name: "X", reason: "r" })).rejects.toBeInstanceOf(AccessError);
  });

  it("кандидата можно посвятить напрямую (основатель из ядра)", async () => {
    const b = await base();
    const cand = await addMember(b.s, { status: "candidate", number: null });
    const m = await admitDirect(b.s, NOW, { by: b.creator.id, member_id: cand.id, name: "Мария", reason: "якорь" });
    expect(m).toMatchObject({ id: cand.id, status: "member", name: "Мария" });
    expect(m.number).not.toBeNull();
  });
});

describe("испытательный месяц: автоматический выход", () => {
  it("месяц закончился, помощи нет → выход по умолчанию + запись в журнал", async () => {
    const b = await base();
    const p = await probationer(b, 35);
    const res = await probationSweep(b.s, NOW);
    expect(res.exited.map((m) => m.id)).toEqual([p.id]);
    expect(await b.s.t.members.get(p.id)).toMatchObject({ status: "left", left_reason: "probation_empty" });
    expect(await b.s.t.council_journal.list({ kind: "probation_exit" })).toHaveLength(1);
  });

  it("месяц ещё не закончился → ничего", async () => {
    const b = await base();
    await probationer(b, 10);
    const res = await probationSweep(b.s, NOW);
    expect(res.exited).toHaveLength(0);
    expect(res.ready).toHaveLength(0);
  });

  it("месяц закончился, помощь есть → «готов к посвящению» один раз, статус не меняется", async () => {
    const b = await base();
    const p = await probationer(b, 35);
    await helpedBy(b, p.id, 10);
    const first = await probationSweep(b.s, NOW);
    expect(first.ready.map((m) => m.id)).toEqual([p.id]);
    expect((await b.s.t.members.get(p.id))!.status).toBe("probation");
    const second = await probationSweep(b.s, NOW);
    expect(second.ready).toHaveLength(0);
  });

  it("Совет может отменить выход решением с причиной: снова испытательный месяц", async () => {
    const b = await base();
    const p = await probationer(b, 35);
    await probationSweep(b.s, NOW);
    await expect(keepProbation(b.s, NOW, { by: b.creator.id, member_id: p.id, reason: " " })).rejects.toMatchObject({ code: "reason_required" });
    const res = await keepProbation(b.s, NOW, { by: b.creator.id, member_id: p.id, reason: "болел весь месяц" });
    expect(res.member).toMatchObject({ status: "probation", left_reason: null, left_at: null });
    expect(res.member.probation_until).toBe("2026-11-11T11:00:00.000Z");
    expect(res.decision).toMatchObject({ kind: "probation_override", public_reason: "болел весь месяц" });
  });

  it("отменить можно только выход по пустому испытательному", async () => {
    const b = await base();
    const m = await addMember(b.s);
    await expect(keepProbation(b.s, NOW, { by: b.creator.id, member_id: m.id, reason: "почему бы и нет" })).rejects.toMatchObject({ code: "not_exited" });
  });
});

describe("гарантия первой помощи", () => {
  it("создатель отмечает: поговорили / помогли / решения нет, сказали прямо", async () => {
    const b = await base();
    const p = await probationer(b);
    const fh = await b.s.t.first_help.insert({ member_id: p.id, main_request: "найти юриста", sponsor_id: null, talk_deadline: addDays(NOW, 5).toISOString(), status: "pending", helped_at: null, created_at: ago(9) });
    expect((await setFirstHelpStatus(b.s, NOW, { by: b.creator.id, member_id: p.id, status: "talked" })).status).toBe("talked");
    const done = await setFirstHelpStatus(b.s, NOW, { by: b.creator.id, member_id: p.id, status: "helped" });
    expect(done).toMatchObject({ id: fh.id, status: "helped", helped_at: NOW.toISOString() });
    await expect(setFirstHelpStatus(b.s, NOW, { by: p.id, member_id: p.id, status: "helped" })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("выход из клуба: личные данные удаляются, помощь остаётся", () => {
  it("стираются имя, ниша, навыки, Telegram; номер и записи о помощи остаются; подпись — «бывший участник»", async () => {
    const b = await base();
    const leaver = await addMember(b.s, { name: "Пётр", niche: "дизайн", skills: ["логотипы"], tg_username: "petr" });
    const friend = await addMember(b.s);
    await b.s.t.helps.insert({ helper_id: friend.id, receiver_id: leaver.id, sphere_id: b.sphere.id, grade: 6, review: "спасибо", request_id: null, created_at: ago(5), confirmed_at: ago(5) });
    await b.s.t.helps.insert({ helper_id: leaver.id, receiver_id: friend.id, sphere_id: b.sphere.id, grade: 3, review: "ок", request_id: null, created_at: ago(4), confirmed_at: ago(4) });

    const before = await currentPulse(b.s, NOW, friend.id);
    const out = await leaveClub(b.s, NOW, leaver.id);
    expect(out).toMatchObject({ status: "left", name: null, niche: null, skills: [], tg_user_id: null, tg_username: null, left_at: NOW.toISOString() });
    expect(out.number).toBe(leaver.number);
    expect(memberLabel(out)).toBe("бывший участник");
    expect(await b.s.t.helps.list()).toHaveLength(2);
    expect((await currentPulse(b.s, NOW, friend.id)).value).toBe(before.value);
  });

  it("активный запрос и предложение вышедшего закрываются; открытые запросы встреч отменяются, кредит возвращается", async () => {
    const b = await base();
    const leaver = await addMember(b.s);
    const other = await addMember(b.s);
    await createRequest(b.s, NOW, { author_id: leaver.id, text: "нужна помощь", sphere_id: b.sphere.id, deadline: addDays(NOW, 5).toISOString(), is_urgent: false, is_sensitive: false, visible_to: [] });
    await b.s.t.offers.insert({ author_id: leaver.id, text: "могу", sphere_id: b.sphere.id, is_active: true, created_at: ago(1) });
    await b.s.t.credit_ledger.insert({ member_id: leaver.id, delta: 1, reason: "grant", ref_id: null, created_at: ago(2) });
    const { requestMeeting } = await import("../src/meetings");
    const mr = await requestMeeting(b.s, NOW, { from_id: leaver.id, to_id: other.id, uses_credit: true, purpose: "кофе" });

    await leaveClub(b.s, NOW, leaver.id);
    expect((await b.s.t.requests.list({ author_id: leaver.id }))[0].status).toBe("canceled");
    expect((await b.s.t.offers.list({ author_id: leaver.id }))[0].is_active).toBe(false);
    expect((await b.s.t.meeting_requests.get(mr.request.id))!.status).toBe("canceled");
  });

  it("анкета, главный запрос и сессия бота стираются", async () => {
    const b = await base();
    const cand = await addMember(b.s, { status: "candidate", number: null, tg_user_id: 55 });
    await b.s.t.applications.insert({ member_id: cand.id, answers: ["личное", "личное", "", "", "", "", "", ""], short_flags: Array(8).fill(false), reviewer_ids: [], status: "call_done", call_notes: "заметки", main_request: "личный запрос", useful_task_id: null, useful_done_at: null, reject_reason: null, submitted_at: null, decided_at: null, created_at: ago(5) });
    await b.s.t.bot_sessions.insert({ id: "55", tg_user_id: 55, state: "x", data: { a: 1 }, updated_at: ago(1) });
    await leaveClub(b.s, NOW, cand.id);
    const app = (await b.s.t.applications.list({ member_id: cand.id }))[0];
    expect(app.answers.every((a) => a === "")).toBe(true);
    expect(app).toMatchObject({ call_notes: null, main_request: null });
    expect(await b.s.t.bot_sessions.get("55")).toBeUndefined();
  });
});

describe("версии формулы Пульса", () => {
  it("новая версия: нужна ссылка на решение Совета и вступление не раньше следующего квартала", async () => {
    const b = await base();
    const params = { ...PULSE_V1, pair_cap: 10 };
    await expect(addFormulaVersion(b.s, NOW, { by: b.creator.id, params, decision_ref: " ", effective_from: startOfNextQuarter(NOW).toISOString() })).rejects.toMatchObject({ code: "decision_required" });
    await expect(addFormulaVersion(b.s, NOW, { by: b.creator.id, params, decision_ref: "Решение №3", effective_from: addDays(NOW, 5).toISOString() })).rejects.toMatchObject({ code: "frozen" });
    const v = await addFormulaVersion(b.s, NOW, { by: b.creator.id, params, decision_ref: "Решение №3", effective_from: startOfNextQuarter(NOW).toISOString() });
    expect(v.version).toBe(2);
    const plain = await addMember(b.s);
    await expect(addFormulaVersion(b.s, NOW, { by: plain.id, params, decision_ref: "x", effective_from: startOfNextQuarter(NOW).toISOString() })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("месячные снимки Пульса и правило «< 20 два месяца подряд»", () => {
  const at = (iso: string) => new Date(iso);

  it("снимок за прошлый месяц: по каждому посвящённому, второй запуск ничего не добавляет", async () => {
    const b = await base();
    const m = await addMember(b.s);
    await helpedBy(b, m.id, 40);
    const now = at("2026-10-02T08:00:00Z");
    const first = await takeMonthlySnapshot(b.s, now);
    expect(first.month_key).toBe("2026-09");
    expect(first.created).toBeGreaterThanOrEqual(3);
    const snap = (await b.s.t.pulse_snapshots.list({ member_id: m.id }))[0];
    expect(snap.month_key).toBe("2026-09");
    const direct = await currentPulse(b.s, at("2026-09-30T22:00:00Z"), m.id); // начало октября по Берлину
    expect(snap.value).toBe(direct.value);
    expect((await takeMonthlySnapshot(b.s, now)).created).toBe(0);
  });

  async function snaps(b: Base, memberId: string, values: Record<string, number>) {
    for (const [month_key, value] of Object.entries(values)) {
      await b.s.t.pulse_snapshots.insert({ member_id: memberId, month_key, value, contribution: 0, connections: 0, formula_version: 1, created_at: NOW.toISOString() });
    }
  }

  it("< 20 два месяца подряд → stopped и запись «нужен разговор»; это не исключение", async () => {
    const b = await base();
    const m = await addMember(b.s);
    await snaps(b, m.id, { "2026-09": 10, "2026-10": 12 });
    const stopped = await applyStopRule(b.s, at("2026-11-02T08:00:00Z"));
    expect(stopped.map((x) => x.id)).toEqual([m.id]);
    expect((await b.s.t.members.get(m.id))!.status).toBe("stopped");
    expect(await b.s.t.council_journal.list({ kind: "stopped_talk_needed" })).toHaveLength(1);
  });

  it("один плохой месяц — не повод; ровно 20 — не «меньше 20»", async () => {
    const b = await base();
    const m1 = await addMember(b.s);
    const m2 = await addMember(b.s);
    await snaps(b, m1.id, { "2026-09": 50, "2026-10": 12 });
    await snaps(b, m2.id, { "2026-09": 20, "2026-10": 5 });
    expect(await applyStopRule(b.s, at("2026-11-02T08:00:00Z"))).toHaveLength(0);
  });

  it("тихие месяцы (июль, август, декабрь) не считаются: смотрим июнь и май", async () => {
    const b = await base();
    const m = await addMember(b.s);
    await snaps(b, m.id, { "2026-05": 8, "2026-06": 9, "2026-07": 60, "2026-08": 70 });
    const stopped = await applyStopRule(b.s, at("2026-09-02T08:00:00Z"));
    expect(stopped.map((x) => x.id)).toEqual([m.id]);
  });

  it("нет снимка за один из двух месяцев (человек был в клубе меньше) — не останавливаем; испытательных не трогаем", async () => {
    const b = await base();
    const m = await addMember(b.s);
    const p = await addMember(b.s, { status: "probation", number: null });
    await snaps(b, m.id, { "2026-10": 3 });
    await snaps(b, p.id, { "2026-09": 1, "2026-10": 1 });
    expect(await applyStopRule(b.s, at("2026-11-02T08:00:00Z"))).toHaveLength(0);
  });

  it("свой Пульс виден владельцу и Совету, чужой — нет", async () => {
    const b = await base();
    const m = await addMember(b.s);
    const other = await addMember(b.s);
    await expect(getPulseFor(b.s, NOW, m.id, m.id)).resolves.toBeTruthy();
    await expect(getPulseFor(b.s, NOW, b.creator.id, m.id)).resolves.toBeTruthy();
    await expect(getPulseFor(b.s, NOW, b.a1.id, m.id)).resolves.toBeTruthy();
    await expect(getPulseFor(b.s, NOW, other.id, m.id)).rejects.toBeInstanceOf(AccessError);
  });
});

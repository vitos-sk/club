import { describe, expect, it } from "vitest";
import {
  acceptCandidate,
  attachSponsor,
  chooseUsefulTask,
  createEvent,
  getApplication,
  markGuest,
  recordCall,
  rejectCandidate,
  reviewAnswer,
  saveAnswer,
  startCandidate,
  submitApplication,
} from "../src/selection";
import { addDays } from "../src/time";
import { AccessError, DomainError } from "../src/types";
import { NOW, addMember, newStore } from "./helpers";

const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const LONG = "Это достаточно развёрнутый ответ на вопрос анкеты.";

async function club() {
  const s = await newStore();
  const creator = await addMember(s, { is_creator: true, name: "Создатель", status: "council" });
  const a1 = await addMember(s, { status: "council", name: "Якорь 1" });
  const a2 = await addMember(s, { status: "council", name: "Якорь 2" });
  for (const m of [a1, a2]) {
    await s.t.council_terms.insert({ member_id: m.id, starts_on: ago(30), ends_on: addDays(NOW, 335).toISOString(), term_no: 1, warned_at: null });
  }
  await s.setConfig({ reviewer_pool_ids: [creator.id, a1.id, a2.id] });
  const event = await createEvent(s, NOW, { by: creator.id, title: "Открытая встреча", starts_at: ago(3), is_open: true });
  const task = await s.t.useful_tasks.insert({ title: "Перевести памятку для новичков", is_active: true });
  return { s, creator, a1, a2, event, task };
}

type Club = Awaited<ReturnType<typeof club>>;

let tgSeq = 7000;
async function guest(c: Club, over: { tg_user_id?: number; tg_username?: string } = {}) {
  const tg_user_id = over.tg_user_id ?? ++tgSeq;
  await markGuest(c.s, NOW, { by: c.creator.id, event_id: c.event.id, tg_user_id, tg_username: over.tg_username });
  return tg_user_id;
}

async function candidate(c: Club, sponsor_id?: string) {
  const tg = await guest(c);
  const r = await startCandidate(c.s, NOW, { tg_user_id: tg, tg_username: `cand${tg}`, name: "Кандидат", codeword: "Движение", sponsor_id });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

async function submitted(c: Club, sponsor_id?: string) {
  const r = await candidate(c, sponsor_id);
  for (let q = 1; q <= 8; q++) await saveAnswer(c.s, NOW, r.application.id, q, LONG);
  const app = await submitApplication(c.s, NOW, r.application.id);
  return { member: r.member, app };
}

describe("вход: кодовое слово и гость", () => {
  it("неверное слово — отказ, запись не создаётся", async () => {
    const c = await club();
    const tg = await guest(c);
    const r = await startCandidate(c.s, NOW, { tg_user_id: tg, codeword: "Привет" });
    expect(r).toEqual({ ok: false, reason: "bad_codeword" });
    expect((await c.s.t.members.list({ tg_user_id: tg })).length).toBe(0);
  });

  it("слово без учёта регистра, пробелов и буквы ё", async () => {
    const c = await club();
    const tg = await guest(c);
    expect((await startCandidate(c.s, NOW, { tg_user_id: tg, codeword: "  движение " })).ok).toBe(true);
  });

  it("верное слово, но не отмечен гостем — не пускаем в анкету", async () => {
    const c = await club();
    const r = await startCandidate(c.s, NOW, { tg_user_id: 999_001, codeword: "Движение" });
    expect(r).toEqual({ ok: false, reason: "not_guest" });
    expect(await c.s.t.applications.list()).toHaveLength(0);
  });

  it("гость, отмеченный по @нику (в любом регистре), опознаётся по нику; id запоминается", async () => {
    const c = await club();
    await markGuest(c.s, NOW, { by: c.creator.id, event_id: c.event.id, tg_username: "@Anna_K" });
    const r = await startCandidate(c.s, NOW, { tg_user_id: 123_456, tg_username: "anna_k", codeword: "Движение" });
    expect(r.ok).toBe(true);
    expect((await c.s.t.guests.list())[0].tg_user_id).toBe(123_456);
  });

  it("гостем можно стать только на ОТКРЫТОМ событии", async () => {
    const c = await club();
    const closed = await createEvent(c.s, NOW, { by: c.creator.id, title: "Закрытая", starts_at: ago(1), is_open: false });
    await expect(markGuest(c.s, NOW, { by: c.creator.id, event_id: closed.id, tg_user_id: 1 })).rejects.toBeInstanceOf(DomainError);
  });

  it("гостей и события отмечает только создатель или Совет", async () => {
    const c = await club();
    const plain = await addMember(c.s);
    await expect(markGuest(c.s, NOW, { by: plain.id, event_id: c.event.id, tg_user_id: 2 })).rejects.toBeInstanceOf(AccessError);
    await expect(createEvent(c.s, NOW, { by: plain.id, title: "x", starts_at: ago(1), is_open: true })).rejects.toBeInstanceOf(AccessError);
  });

  it("повторный вход продолжает ту же анкету, а не создаёт новую", async () => {
    const c = await club();
    const first = await candidate(c);
    const again = await startCandidate(c.s, NOW, { tg_user_id: first.member.tg_user_id!, codeword: "Движение" });
    expect(again.ok && again.application.id).toBe(first.application.id);
  });
});

describe("анкета", () => {
  it("короткие ответы помечаются, но принимаются", async () => {
    const c = await club();
    const r = await candidate(c);
    expect((await saveAnswer(c.s, NOW, r.application.id, 1, "Помощь")).short).toBe(true);
    expect((await saveAnswer(c.s, NOW, r.application.id, 2, LONG)).short).toBe(false);
    const app = (await c.s.t.applications.get(r.application.id))!;
    expect(app.short_flags.slice(0, 2)).toEqual([true, false]);
    expect(app.answers[0]).toBe("Помощь");
  });

  it("вопросов ровно 8", async () => {
    const c = await club();
    const r = await candidate(c);
    await expect(saveAnswer(c.s, NOW, r.application.id, 9, LONG)).rejects.toBeInstanceOf(DomainError);
    await expect(saveAnswer(c.s, NOW, r.application.id, 0, LONG)).rejects.toBeInstanceOf(DomainError);
  });

  it("отправить можно только когда отвечено на все 8", async () => {
    const c = await club();
    const r = await candidate(c);
    for (let q = 1; q <= 7; q++) await saveAnswer(c.s, NOW, r.application.id, q, LONG);
    await expect(submitApplication(c.s, NOW, r.application.id)).rejects.toMatchObject({ code: "incomplete" });
  });

  it("двое проверяющих назначаются из пула, не включая поручителя и самого кандидата", async () => {
    const c = await club();
    const { app } = await submitted(c, c.a1.id);
    expect(app.status).toBe("review");
    expect(new Set(app.reviewer_ids)).toEqual(new Set([c.creator.id, c.a2.id]));
  });

  it("если проверяющих меньше двух — ошибка", async () => {
    const c = await club();
    await c.s.setConfig({ reviewer_pool_ids: [c.creator.id] });
    const r = await candidate(c);
    for (let q = 1; q <= 8; q++) await saveAnswer(c.s, NOW, r.application.id, q, LONG);
    await expect(submitApplication(c.s, NOW, r.application.id)).rejects.toMatchObject({ code: "no_reviewers" });
  });
});

describe("оценка анкеты двумя проверяющими", () => {
  async function review(c: Club, appId: string, reviewer: string, verdicts: ("ok" | "refuse")[]) {
    let last;
    for (let i = 0; i < verdicts.length; i++) last = await reviewAnswer(c.s, NOW, { application_id: appId, reviewer_id: reviewer, question_no: i + 1, verdict: verdicts[i] });
    return last!;
  }
  const ok8 = Array<"ok">(8).fill("ok");
  const twoRefuse: ("ok" | "refuse")[] = ["refuse", "ok", "refuse", "ok", "ok", "ok", "ok", "ok"];
  const oneRefuse: ("ok" | "refuse")[] = ["refuse", "ok", "ok", "ok", "ok", "ok", "ok", "ok"];

  it("два «отказа» из восьми → отказ по анкете", async () => {
    const c = await club();
    const { app } = await submitted(c);
    const [r1, r2] = app.reviewer_ids;
    await review(c, app.id, r1, twoRefuse);
    const end = await review(c, app.id, r2, ok8);
    expect(end).toMatchObject({ finished: true, status: "rejected", refused: [1, 3] });
    expect((await getApplication(c.s, app.member_id))!.status).toBe("rejected");
  });

  it("один «отказ» → дальше, на звонок", async () => {
    const c = await club();
    const { app } = await submitted(c);
    const [r1, r2] = app.reviewer_ids;
    await review(c, app.id, r1, oneRefuse);
    const end = await review(c, app.id, r2, ok8);
    expect(end).toMatchObject({ finished: true, status: "call", refused: [1] });
  });

  it("пока не оценили все 8 ответов обоими — решения нет", async () => {
    const c = await club();
    const { app } = await submitted(c);
    const [r1, r2] = app.reviewer_ids;
    expect((await review(c, app.id, r1, ok8)).finished).toBe(false);
    expect((await review(c, app.id, r2, ok8.slice(0, 7))).finished).toBe(false);
    expect((await getApplication(c.s, app.member_id))!.status).toBe("review");
  });

  it("правило «any»: отказ одного проверяющего делает ответ отказным", async () => {
    const c = await club();
    const { app } = await submitted(c);
    const [r1, r2] = app.reviewer_ids;
    await review(c, app.id, r1, ["refuse", "refuse", ...Array<"ok">(6).fill("ok")]);
    expect((await review(c, app.id, r2, ok8)).status).toBe("rejected");
  });

  it("правило «both»: ответ отказной, только если отказали оба", async () => {
    const c = await club();
    await c.s.setConfig({ refuse_rule: "both" });
    const { app } = await submitted(c);
    const [r1, r2] = app.reviewer_ids;
    await review(c, app.id, r1, ["refuse", "refuse", ...Array<"ok">(6).fill("ok")]);
    const end = await review(c, app.id, r2, ["refuse", "ok", ...Array<"ok">(6).fill("ok")]);
    expect(end).toMatchObject({ status: "call", refused: [1] });
  });

  it("оценивать могут только назначенные проверяющие; вопросы 1–8", async () => {
    const c = await club();
    const { app } = await submitted(c, c.a1.id);
    await expect(reviewAnswer(c.s, NOW, { application_id: app.id, reviewer_id: c.a1.id, question_no: 1, verdict: "ok" })).rejects.toBeInstanceOf(AccessError);
    await expect(reviewAnswer(c.s, NOW, { application_id: app.id, reviewer_id: app.reviewer_ids[0], question_no: 9, verdict: "ok" })).rejects.toBeInstanceOf(DomainError);
  });

  it("проверяющий может поправить свою оценку, пока решение не принято", async () => {
    const c = await club();
    const { app } = await submitted(c);
    const r1 = app.reviewer_ids[0];
    await reviewAnswer(c.s, NOW, { application_id: app.id, reviewer_id: r1, question_no: 1, verdict: "refuse" });
    await reviewAnswer(c.s, NOW, { application_id: app.id, reviewer_id: r1, question_no: 1, verdict: "ok" });
    const rows = await c.s.t.application_reviews.list({ application_id: app.id, reviewer_id: r1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("ok");
  });
});

describe("поручитель", () => {
  async function sponsorFixture() {
    const c = await club();
    const sponsor = await addMember(c.s, { status: "member" });
    return { ...c, sponsor };
  }

  it("не больше 2 кандидатов в квартал; третьему — отказ, в новом квартале снова можно", async () => {
    const c = await sponsorFixture();
    await candidate(c, c.sponsor.id);
    await candidate(c, c.sponsor.id);
    const tg = await guest(c);
    const third = await startCandidate(c.s, NOW, { tg_user_id: tg, codeword: "Движение", sponsor_id: c.sponsor.id });
    expect(third.ok && third.sponsor_error).toMatch(/2 кандидат/);
    if (third.ok) expect(third.member.sponsor_id).toBeNull();

    const tg2 = await guest(c);
    const nextQuarter = new Date("2027-01-15T10:00:00Z");
    const later = await startCandidate(c.s, nextQuarter, { tg_user_id: tg2, codeword: "Движение", sponsor_id: c.sponsor.id });
    expect(later.ok && later.sponsor_error).toBeUndefined();
  });

  it("прямая привязка поручителя тоже ограничена: attachSponsor третьему кандидату — ошибка sponsor_limit", async () => {
    const c = await sponsorFixture();
    await candidate(c, c.sponsor.id);
    await candidate(c, c.sponsor.id);
    const third = await candidate(c);
    await expect(attachSponsor(c.s, NOW, third.member.id, c.sponsor.id)).rejects.toMatchObject({ code: "sponsor_limit" });
  });

  it("отклонённый кандидат место в лимите не освобождает", async () => {
    const c = await sponsorFixture();
    const first = await candidate(c, c.sponsor.id);
    await candidate(c, c.sponsor.id);
    await c.s.t.applications.update(first.application.id, { status: "rejected" });
    const third = await candidate(c);
    await expect(attachSponsor(c.s, NOW, third.member.id, c.sponsor.id)).rejects.toMatchObject({ code: "sponsor_limit" });
  });

  it("поручителем не может быть кандидат или человек без номера", async () => {
    const c = await sponsorFixture();
    const cand = await candidate(c);
    const other = await candidate(c);
    await expect(attachSponsor(c.s, NOW, cand.member.id, other.member.id)).rejects.toBeInstanceOf(DomainError);
    await expect(attachSponsor(c.s, NOW, cand.member.id, cand.member.id)).rejects.toBeInstanceOf(DomainError);
  });

  it("когда в клубе 30 участников — поручитель только Партнёр и выше (флаг в конфиге)", async () => {
    const c = await sponsorFixture();
    for (let i = 0; i < 28; i++) await addMember(c.s); // 3 + 1 + 28 = 32 посвящённых
    const partner = await addMember(c.s, { status: "partner" });
    const cand = await candidate(c);
    await expect(attachSponsor(c.s, NOW, cand.member.id, c.sponsor.id)).rejects.toMatchObject({ code: "sponsor_gate" });
    await expect(attachSponsor(c.s, NOW, cand.member.id, partner.id)).resolves.toBeTruthy();

    await c.s.setConfig({ sponsor_gate_enabled: false });
    const cand2 = await candidate(c);
    await expect(attachSponsor(c.s, NOW, cand2.member.id, c.sponsor.id)).resolves.toBeTruthy();
  });
});

describe("звонок, взнос пользой, приём на испытательный месяц", () => {
  async function passedReview(c: Club, sponsor_id?: string) {
    const { member, app } = await submitted(c, sponsor_id);
    for (const rid of app.reviewer_ids) {
      for (let q = 1; q <= 8; q++) await reviewAnswer(c.s, NOW, { application_id: app.id, reviewer_id: rid, question_no: q, verdict: "ok" });
    }
    return { member, app: (await getApplication(c.s, member.id))! };
  }

  it("звонок: главный запрос записывается дословно и создаёт first_help; только создатель/Совет", async () => {
    const c = await club();
    const { app, member } = await passedReview(c, c.a1.id);
    expect(app.status).toBe("call");
    const plain = await addMember(c.s);
    await expect(recordCall(c.s, NOW, { by: plain.id, application_id: app.id, notes: "x", main_request: "x" })).rejects.toBeInstanceOf(AccessError);

    const verbatim = "  Нужен Steuerberater для Gewerbe, а  то Finanzamt уже пишет  ";
    const res = await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "спокойный, конкретный", main_request: verbatim });
    expect(res.application.status).toBe("call_done");
    expect(res.application.main_request).toBe(verbatim);
    expect(res.first_help).toMatchObject({ member_id: member.id, main_request: verbatim, status: "pending", sponsor_id: c.a1.id });
  });

  it("звонок возможен только после успешной анкеты", async () => {
    const c = await club();
    const { app } = await submitted(c);
    await expect(recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "x" })).rejects.toBeInstanceOf(DomainError);
  });

  it("принять на испытательный нельзя без звонка и без выбранной задачи для взноса пользой", async () => {
    const c = await club();
    const { app, member } = await passedReview(c);
    await expect(acceptCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "сильная анкета" })).rejects.toMatchObject({ code: "no_call" });
    await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "запрос" });
    await expect(acceptCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "сильная анкета" })).rejects.toMatchObject({ code: "no_useful_task" });
  });

  it("приём: статус probation, срок месяц, у first_help срок +14 дней, решение записано с причиной", async () => {
    const c = await club();
    const { app, member } = await passedReview(c);
    await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "запрос" });
    await chooseUsefulTask(c.s, NOW, app.id, c.task.id);
    const res = await acceptCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "сильная анкета и хороший звонок" });

    expect(res.member).toMatchObject({ status: "probation", joined_at: NOW.toISOString() });
    expect(res.member.probation_until).toBe("2026-11-11T11:00:00.000Z"); // +1 календарный месяц по Берлину
    expect((await c.s.t.first_help.list({ member_id: member.id }))[0].talk_deadline).toBe(addDays(NOW, 14).toISOString());
    expect((await getApplication(c.s, member.id))!).toMatchObject({ status: "accepted", useful_done_at: NOW.toISOString() });
    expect(res.decision).toMatchObject({ kind: "admission", public_reason: "сильная анкета и хороший звонок", decided_by: c.creator.id });
  });

  it("приём требует причину; поручитель кандидата сам решение принять не может", async () => {
    const c = await club();
    const { app, member } = await passedReview(c, c.a1.id);
    await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "запрос" });
    await chooseUsefulTask(c.s, NOW, app.id, c.task.id);
    await expect(acceptCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "  " })).rejects.toMatchObject({ code: "reason_required" });
    await expect(acceptCandidate(c.s, NOW, { by: c.a1.id, member_id: member.id, reason: "мой кандидат" })).rejects.toMatchObject({ code: "recused" });
    await expect(acceptCandidate(c.s, NOW, { by: c.a2.id, member_id: member.id, reason: "согласен" })).resolves.toBeTruthy();
  });

  it("клуб из 30+ без поручителя Партнёр+: приём невозможен", async () => {
    const c = await club();
    for (let i = 0; i < 30; i++) await addMember(c.s);
    const { app, member } = await passedReview(c);
    await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "запрос" });
    await chooseUsefulTask(c.s, NOW, app.id, c.task.id);
    await expect(acceptCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "ок" })).rejects.toMatchObject({ code: "sponsor_required" });
  });

  it("отказ после звонка: статус, причина, решение", async () => {
    const c = await club();
    const { app, member } = await passedReview(c);
    await recordCall(c.s, NOW, { by: c.creator.id, application_id: app.id, notes: "", main_request: "запрос" });
    const decision = await rejectCandidate(c.s, NOW, { by: c.creator.id, member_id: member.id, reason: "не готов к обязательствам" });
    expect(decision.kind).toBe("rejection");
    expect((await getApplication(c.s, member.id))).toMatchObject({ status: "rejected", reject_reason: "не готов к обязательствам" });
    // отклонённый не может начать заново тем же словом
    const again = await startCandidate(c.s, NOW, { tg_user_id: member.tg_user_id!, codeword: "Движение" });
    expect(again).toEqual({ ok: false, reason: "rejected" });
  });

  it("задачу для взноса пользой можно выбрать только из активных", async () => {
    const c = await club();
    const { app } = await passedReview(c);
    const off = await c.s.t.useful_tasks.insert({ title: "Старая", is_active: false });
    await expect(chooseUsefulTask(c.s, NOW, app.id, off.id)).rejects.toBeInstanceOf(DomainError);
    await expect(chooseUsefulTask(c.s, NOW, app.id, "нет")).rejects.toBeInstanceOf(DomainError);
  });
});

import { describe, expect, it } from "vitest";
import { allCsv, toCsv } from "../src/export";
import { computeMetrics, formatReport, type MetricResult } from "../src/metrics";
import { NOW, addMember, newStore } from "./helpers";

type S = Awaited<ReturnType<typeof newStore>>;
const NOWM = new Date("2026-10-05T10:00:00Z");
const get = (r: { metrics: MetricResult[] }, key: string) => r.metrics.find((m) => m.key === key)!;

async function help(s: S, helper: string, receiver: string, at: string, grade: 1 | 3 | 6 = 3, request_id: string | null = null) {
  const sphere = (await s.t.spheres.list())[0];
  return s.t.helps.insert({ helper_id: helper, receiver_id: receiver, sphere_id: sphere.id, grade, review: "ок", request_id, created_at: at, confirmed_at: at });
}
async function request(s: S, author: string, at: string, over: Record<string, unknown> = {}) {
  const sphere = (await s.t.spheres.list())[0];
  return s.t.requests.insert({ author_id: author, text: "нужно", sphere_id: sphere.id, deadline: "2027-01-01T00:00:00Z", is_urgent: false, is_sensitive: false, visible_to: [], status: "active", closed_by_help: false, closed_at: null, created_at: at, ...over });
}

describe("метрика 1: доля активных", () => {
  it("помощь (с любой стороны), подтверждённая встреча или отклик за месяц; посвящённые в знаменателе", async () => {
    const s = await newStore();
    const [a, b, c, d] = [await addMember(s), await addMember(s), await addMember(s), await addMember(s)];
    await addMember(s, { status: "probation", number: null }); // не считается
    await addMember(s, { status: "left" }); // не считается
    await help(s, a.id, b.id, "2026-09-10T10:00:00Z"); // активны a и b
    const req = await request(s, d.id, "2026-09-02T10:00:00Z");
    await s.t.responses.insert({ request_id: req.id, responder_id: c.id, message: "", mode: "help", is_chosen: false, created_at: "2026-09-03T10:00:00Z" }); // активен c
    const r = await computeMetrics(s, NOWM, "2026-09");
    // a, b, c активны; d написал запрос, но запрос — не отклик, не помощь → не активен
    expect(get(r, "active_share").value).toBeCloseTo(3 / 4, 10);
    expect(get(r, "active_share").status).toBe("норма");
  });

  it("встреча, подтверждённая обеими сторонами, делает активными обоих; односторонняя — нет", async () => {
    const s = await newStore();
    const [a, b, c, d] = [await addMember(s), await addMember(s), await addMember(s), await addMember(s)];
    await s.t.meetings.insert({ a_id: a.id, b_id: b.id, request_id: null, via_credit: false, a_confirmed: true, b_confirmed: true, is_first: true, created_at: "2026-09-05T10:00:00Z", met_at: "2026-09-05T10:00:00Z" });
    await s.t.meetings.insert({ a_id: c.id, b_id: d.id, request_id: null, via_credit: false, a_confirmed: true, b_confirmed: false, is_first: null, created_at: "2026-09-05T10:00:00Z", met_at: null });
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "active_share").value).toBeCloseTo(2 / 4, 10);
  });

  it("тревога — только если ниже 35 % два месяца подряд", async () => {
    const s = await newStore();
    const ms = [];
    for (let i = 0; i < 10; i++) ms.push(await addMember(s));
    await help(s, ms[0].id, ms[1].id, "2026-09-10T10:00:00Z"); // сентябрь: 2/10 = 20 %
    // октябрьский расчёт нужен для месяца 2026-10, ниже проверяем сентябрь с августом без помощи и с помощью
    let r = await computeMetrics(s, NOWM, "2026-09");
    expect(get(r, "active_share").value).toBeCloseTo(0.2, 10);
    // предыдущий обычный месяц (июнь: июль и август тихие) без активности → тоже ниже 35 % → тревога
    expect(get(r, "active_share").status).toBe("тревога");

    // если в предыдущем обычном месяце активность была нормальной — только «внимание»
    for (let i = 0; i < 6; i++) await help(s, ms[i].id, ms[i + 1].id, "2026-06-10T10:00:00Z");
    r = await computeMetrics(s, NOWM, "2026-09");
    expect(get(r, "active_share").status).toBe("внимание");
  });

  it("тихие месяцы (июль, август, декабрь): тревога по активности не срабатывает, помечено quiet", async () => {
    const s = await newStore();
    for (let i = 0; i < 10; i++) await addMember(s);
    const r = await computeMetrics(s, NOWM, "2026-08");
    const m = get(r, "active_share");
    expect(m.value).toBe(0);
    expect(m.quiet).toBe(true);
    expect(m.status).toBe("внимание");
    expect(r.quiet).toBe(true);
  });
});

describe("метрика 2: новички с первой помощью за 30 дней", () => {
  it("доля новичков месяца, у которых first_help = helped не позже чем через 30 дней", async () => {
    const s = await newStore();
    const mk = async (joined: string, status: "helped" | "pending", helped_at: string | null) => {
      const m = await addMember(s, { status: "probation", number: null, joined_at: joined });
      await s.t.first_help.insert({ member_id: m.id, main_request: "x", sponsor_id: null, talk_deadline: null, status, helped_at, created_at: joined });
    };
    await mk("2026-09-02T10:00:00Z", "helped", "2026-09-20T10:00:00Z"); // в срок
    await mk("2026-09-03T10:00:00Z", "helped", "2026-10-15T10:00:00Z"); // позже 30 дней
    await mk("2026-09-04T10:00:00Z", "pending", null);
    await mk("2026-09-05T10:00:00Z", "helped", "2026-09-06T10:00:00Z"); // в срок
    const m = get(await computeMetrics(s, new Date("2026-11-01T10:00:00Z"), "2026-09"), "newcomer_first_help");
    expect(m.value).toBeCloseTo(2 / 4, 10);
    expect(m.status).toBe("внимание"); // 0,5 — не ниже порога тревоги
  });

  it("нет новичков — «нет данных»", async () => {
    const s = await newStore();
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "newcomer_first_help").status).toBe("нет данных");
  });
});

describe("метрика 3: удержание 3 месяца", () => {
  it("доля вступивших 3 месяца назад, кто не left и не expelled", async () => {
    const s = await newStore();
    await addMember(s, { joined_at: "2026-06-10T10:00:00Z" });
    await addMember(s, { joined_at: "2026-06-12T10:00:00Z" });
    await addMember(s, { joined_at: "2026-06-15T10:00:00Z", status: "left" });
    await addMember(s, { joined_at: "2026-07-15T10:00:00Z", status: "left" }); // другая когорта
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "retention_3m");
    expect(m.value).toBeCloseTo(2 / 3, 10);
    expect(m.status).toBe("внимание");
  });
});

describe("метрика 4: запросы с откликом за 48 часов", () => {
  it("отклик в 48 часов или две отметки дежурного; отменённые не считаются", async () => {
    const s = await newStore();
    const [a, b] = [await addMember(s), await addMember(s)];
    const authors = [];
    for (let i = 0; i < 5; i++) authors.push(await addMember(s));
    const base = "2026-09-10T10:00:00Z";
    const r1 = await request(s, authors[0].id, base);
    const r2 = await request(s, authors[1].id, base);
    const r3 = await request(s, authors[2].id, base);
    await request(s, authors[3].id, base); // без отклика
    await request(s, authors[4].id, base, { status: "canceled" });
    await s.t.responses.insert({ request_id: r1.id, responder_id: a.id, message: "", mode: "help", is_chosen: false, created_at: "2026-09-10T20:00:00Z" }); // через 10 ч
    await s.t.responses.insert({ request_id: r2.id, responder_id: a.id, message: "", mode: "help", is_chosen: false, created_at: "2026-09-13T10:00:00Z" }); // через 72 ч
    for (const pinged of [a, b]) await s.t.duty_pings.insert({ request_id: r3.id, duty_member_id: a.id, pinged_member_id: pinged.id, created_at: "2026-09-12T12:00:00Z" });
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "response_48h");
    expect(m.value).toBeCloseTo(2 / 4, 10);
  });
});

describe("метрика 5: доля закрытых запросов", () => {
  it("закрыты подтверждённой помощью / созданные за месяц; тревога ниже 35 %", async () => {
    const s = await newStore();
    for (let i = 0; i < 4; i++) {
      const au = await addMember(s);
      await request(s, au.id, "2026-09-10T10:00:00Z", i === 0 ? { status: "closed", closed_by_help: true } : i === 1 ? { status: "canceled" } : {});
    }
    // создано 3 (отменённый не считаем), закрыт 1 → 33,3 % < 35 %
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "closed_requests");
    expect(m.value).toBeCloseTo(1 / 3, 10);
    expect(m.status).toBe("тревога");
  });
});

describe("метрика 6: концентрация вклада", () => {
  it("доля баллов топ-20 % помощников; > 70 % — тревога", async () => {
    const s = await newStore();
    const top = await addMember(s);
    const others = [];
    for (let i = 0; i < 4; i++) others.push(await addMember(s));
    const recv = [];
    for (let i = 0; i < 4; i++) recv.push(await addMember(s));
    for (const r of recv) await help(s, top.id, r.id, "2026-09-10T10:00:00Z", 6); // 4 × 6 = 24
    for (let i = 0; i < 4; i++) await help(s, others[i].id, recv[i].id, "2026-09-11T10:00:00Z", 1); // по 1
    // помощников 5 → топ-20 % = 1 человек: 24 / 28
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "contribution_concentration");
    expect(m.value).toBeCloseTo(24 / 28, 10);
    expect(m.status).toBe("тревога");
  });
});

describe("метрика 7: явка на событие", () => {
  it("явка / активные участники, среднее по событиям месяца", async () => {
    const s = await newStore();
    const ms = [];
    for (let i = 0; i < 6; i++) ms.push(await addMember(s));
    const e1 = await s.t.events.insert({ title: "Встреча", starts_at: "2026-09-12T15:00:00Z", is_open: true, created_by: ms[0].id });
    const e2 = await s.t.events.insert({ title: "Стул", starts_at: "2026-09-19T15:00:00Z", is_open: false, created_by: ms[0].id });
    for (let i = 0; i < 3; i++) await s.t.attendance.insert({ event_id: e1.id, member_id: ms[i].id, marked_by: ms[0].id, created_at: "2026-09-12T18:00:00Z" });
    for (let i = 0; i < 2; i++) await s.t.attendance.insert({ event_id: e2.id, member_id: ms[i].id, marked_by: ms[0].id, created_at: "2026-09-19T18:00:00Z" });
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "attendance");
    expect(m.value).toBeCloseTo((3 / 6 + 2 / 6) / 2, 10);
    expect(m.status).toBe("внимание");
  });
});

describe("метрика 8: взаимные подтверждения в паре за квартал", () => {
  it("пары, где в обе стороны вместе больше 3 за квартал — на аудит Совета", async () => {
    const s = await newStore();
    const [a, b, c, d, e] = [await addMember(s), await addMember(s), await addMember(s), await addMember(s), await addMember(s)];
    for (const day of ["01", "05"]) {
      await help(s, a.id, b.id, `2026-08-${day}T10:00:00Z`);
      await help(s, b.id, a.id, `2026-08-${day}T12:00:00Z`);
    }
    // c–d: 3 всего — ещё не «больше 3»
    await help(s, c.id, d.id, "2026-08-01T10:00:00Z");
    await help(s, c.id, d.id, "2026-08-03T10:00:00Z");
    await help(s, d.id, c.id, "2026-08-04T10:00:00Z");
    // a→e: 5 раз, но только в одну сторону — это не взаимность
    for (let i = 1; i <= 5; i++) await help(s, a.id, e.id, `2026-08-0${i}T15:00:00Z`);
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "mutual_pairs");
    expect(m.value).toBe(1);
    expect(m.status).toBe("тревога");
    expect(m.detail).toMatch(new RegExp(`№${a.number}.*№${b.number}|№${b.number}.*№${a.number}`));
  });

  it("нет таких пар — норма", async () => {
    const s = await newStore();
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "mutual_pairs")).toMatchObject({ value: 0, status: "норма" });
  });
});

describe("метрика 9: часы создателя в неделю", () => {
  const week = (iso: string, hours: number) => ({ week_start: iso, hours, created_at: iso });
  it("среднее по неделям месяца: 12 — норма", async () => {
    const s = await newStore();
    await s.t.creator_hours.insert(week("2026-09-07T00:00:00Z", 10));
    await s.t.creator_hours.insert(week("2026-09-14T00:00:00Z", 14));
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "creator_hours")).toMatchObject({ value: 12, status: "норма" });
  });
  it("больше 15 один месяц — «внимание»; три месяца подряд — тревога (тихие месяцы это не отменяют)", async () => {
    const s = await newStore();
    await s.t.creator_hours.insert(week("2026-09-07T00:00:00Z", 16));
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "creator_hours").status).toBe("внимание");
    await s.t.creator_hours.insert(week("2026-08-10T00:00:00Z", 17));
    await s.t.creator_hours.insert(week("2026-07-13T00:00:00Z", 18));
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "creator_hours").status).toBe("тревога");
  });
  it("часы не вносили — нет данных", async () => {
    const s = await newStore();
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "creator_hours").status).toBe("нет данных");
  });
});

describe("метрика 10: квота отказов", () => {
  it("меньше трети отказов за месяц — тревога", async () => {
    const s = await newStore();
    const mk = async (status: "accepted" | "rejected") => {
      const m = await addMember(s, { status: "candidate", number: null });
      await s.t.applications.insert({ member_id: m.id, answers: [], short_flags: [], reviewer_ids: [], status, call_notes: null, main_request: null, useful_task_id: null, useful_done_at: null, reject_reason: null, submitted_at: null, decided_at: "2026-09-15T10:00:00Z", created_at: "2026-09-01T10:00:00Z" });
    };
    await mk("rejected");
    await mk("accepted");
    await mk("accepted");
    await mk("accepted");
    const m = get(await computeMetrics(s, NOWM, "2026-09"), "rejection_quota");
    expect(m.value).toBeCloseTo(0.25, 10);
    expect(m.status).toBe("тревога");
    await mk("rejected");
    await mk("rejected"); // 3 из 6 = 50 %
    expect(get(await computeMetrics(s, NOWM, "2026-09"), "rejection_quota").status).toBe("норма");
  });
});

describe("месячный отчёт и CSV", () => {
  it("отчёт содержит все десять метрик, период и статусы, и не содержит личных данных", async () => {
    const s = await newStore();
    const a = await addMember(s, { name: "Секретное Имя" });
    const b = await addMember(s);
    await s.t.helps.insert({ helper_id: a.id, receiver_id: b.id, sphere_id: (await s.t.spheres.list())[0].id, grade: 3, review: "СЕКРЕТНЫЙ ОТЗЫВ", request_id: null, created_at: "2026-09-10T10:00:00Z", confirmed_at: "2026-09-10T10:00:00Z" });
    const text = formatReport(await computeMetrics(s, NOWM, "2026-09"));
    for (const label of ["Доля активных", "Новички с первой помощью", "Удержание 3 месяца", "Запросы с откликом за 48 часов", "Доля закрытых запросов", "Концентрация вклада", "Явка на событие", "Взаимные подтверждения", "Часы создателя", "Квота отказов"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("сентябрь 2026");
    expect(text).not.toMatch(/Секретное|СЕКРЕТНЫЙ/);
  });

  it("CSV: четыре «листа», запятые, кавычки и переносы экранируются; вышедшие — «бывший участник»", async () => {
    const s = await newStore();
    const a = await addMember(s, { name: 'Анна "Ань", Ким', tg_username: "anna" });
    const gone = await addMember(s, { status: "left", name: null });
    await s.t.helps.insert({ helper_id: a.id, receiver_id: gone.id, sphere_id: (await s.t.spheres.list())[0].id, grade: 6, review: "строка 1\nстрока 2, с запятой", request_id: null, created_at: "2026-09-10T10:00:00Z", confirmed_at: "2026-09-10T10:00:00Z" });
    await s.t.credit_ledger.insert({ member_id: a.id, delta: 1, reason: "grant", ref_id: null, created_at: "2026-09-10T10:00:00Z" });
    const files = await allCsv(s);
    expect(files.map((f) => f.filename)).toEqual(["participants.csv", "helps.csv", "meetings.csv", "credits.csv"]);
    const participants = files[0].content;
    expect(participants.split("\n")[0]).toBe("number,name,niche,skills,status,sponsor,joined_at,paused_until");
    expect(participants).toContain('"Анна ""Ань"", Ким"');
    const helps = files[1].content;
    expect(helps).toContain('"строка 1\nстрока 2, с запятой"');
    expect(helps).toContain("бывший участник");
    expect(files[3].content).toMatch(/Анна.*,1,0,1/s);
  });

  it("toCsv: пустые значения и числа", () => {
    expect(toCsv(["a", "b"], [[1, null], ["x,y", undefined]])).toBe('a,b\n1,\n"x,y",\n');
  });
});

// чтобы NOW не считался неиспользуемым импортом в будущем
void NOW;

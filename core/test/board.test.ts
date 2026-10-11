import { describe, expect, it } from "vitest";
import { chooseResponders, createOffer, createRequest, isBackedByContribution, listBoard, respondToRequest, deactivateOffer, cancelRequest } from "../src/board";
import { assignDuty, currentDuty, hungRequests, recordPing } from "../src/duty";
import { confirmHelp } from "../src/helps";
import { creditBalance } from "../src/credits";
import { addDays, addHours } from "../src/time";
import { AccessError, ConstraintError, DomainError } from "../src/types";
import { NOW, addMember, newStore } from "./helpers";

const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

async function setup() {
  const s = await newStore();
  const sphere = (await s.t.spheres.list())[0];
  const a = await addMember(s, { joined_at: ago(400) });
  const b = await addMember(s, { joined_at: ago(400) });
  const c = await addMember(s, { joined_at: ago(400) });
  return { s, sphere, a, b, c };
}

const reqInput = (author_id: string, sphere_id: string, over: Record<string, unknown> = {}) => ({
  author_id,
  text: "Нужен перевод письма",
  sphere_id,
  deadline: addDays(NOW, 7).toISOString(),
  is_urgent: false,
  is_sensitive: false,
  visible_to: [] as string[],
  ...over,
});

async function backed(s: Awaited<ReturnType<typeof newStore>>, helperId: string, otherId: string, daysAgo = 5) {
  const sphere = (await s.t.spheres.list())[0];
  await s.t.helps.insert({
    helper_id: helperId, receiver_id: otherId, sphere_id: sphere.id, grade: 3, review: "ок",
    request_id: null, created_at: ago(daysAgo), confirmed_at: ago(daysAgo),
  });
}

describe("доска: один активный запрос и одно предложение", () => {
  it("второй активный запрос нельзя; после закрытия — можно", async () => {
    const { s, sphere, a } = await setup();
    const first = await createRequest(s, NOW, reqInput(a.id, sphere.id));
    await expect(createRequest(s, NOW, reqInput(a.id, sphere.id))).rejects.toMatchObject({ code: "one_active_request" });
    await cancelRequest(s, NOW, first.id, a.id);
    await expect(createRequest(s, NOW, reqInput(a.id, sphere.id))).resolves.toBeTruthy();
  });

  it("одно активное предложение; выключили — можно новое", async () => {
    const { s, sphere, a } = await setup();
    const o = await createOffer(s, NOW, { author_id: a.id, text: "Резюме на немецком", sphere_id: sphere.id });
    await expect(createOffer(s, NOW, { author_id: a.id, text: "ещё", sphere_id: sphere.id })).rejects.toMatchObject({ code: "one_active_offer" });
    await deactivateOffer(s, o.id, a.id);
    await expect(createOffer(s, NOW, { author_id: a.id, text: "ещё", sphere_id: sphere.id })).resolves.toBeTruthy();
  });

  it("пустой текст, прошедший срок и неизвестная сфера — отказ", async () => {
    const { s, sphere, a } = await setup();
    await expect(createRequest(s, NOW, reqInput(a.id, sphere.id, { text: "  " }))).rejects.toBeInstanceOf(DomainError);
    await expect(createRequest(s, NOW, reqInput(a.id, sphere.id, { deadline: ago(1) }))).rejects.toBeInstanceOf(DomainError);
    await expect(createRequest(s, NOW, reqInput(a.id, "нет-такой"))).rejects.toBeInstanceOf(DomainError);
  });

  it("запрос могут создавать только участники клуба", async () => {
    const { s, sphere } = await setup();
    const cand = await addMember(s, { status: "candidate", number: null });
    await expect(createRequest(s, NOW, reqInput(cand.id, sphere.id))).rejects.toBeInstanceOf(DomainError);
  });
});

describe("доска: «срочно» — раз в календарный месяц", () => {
  it("второй срочный в том же месяце нельзя — даже если первый уже отменён", async () => {
    const { s, sphere, a, b } = await setup();
    await backed(s, a.id, b.id);
    const first = await createRequest(s, NOW, reqInput(a.id, sphere.id, { is_urgent: true }));
    await cancelRequest(s, NOW, first.id, a.id);
    await expect(createRequest(s, addDays(NOW, 2), reqInput(a.id, sphere.id, { is_urgent: true }))).rejects.toMatchObject({ code: "urgent_used" });
    // не срочный — можно
    await expect(createRequest(s, addDays(NOW, 2), reqInput(a.id, sphere.id))).resolves.toBeTruthy();
  });

  it("в следующем месяце «срочно» снова доступно", async () => {
    const { s, sphere, a, b } = await setup();
    await backed(s, a.id, b.id);
    const first = await createRequest(s, NOW, reqInput(a.id, sphere.id, { is_urgent: true }));
    await cancelRequest(s, NOW, first.id, a.id);
    const nextMonth = new Date("2026-11-03T10:00:00Z");
    await expect(createRequest(s, nextMonth, reqInput(a.id, sphere.id, { is_urgent: true, deadline: addDays(nextMonth, 5).toISOString() }))).resolves.toBeTruthy();
  });
});

describe("доска: запрос обеспечен вкладом (правило 60 дней)", () => {
  it("есть подтверждённая помощь за 60 дней — обеспечен; нет — нет", async () => {
    const { s, a, b } = await setup();
    expect(await isBackedByContribution(s, NOW, a.id)).toBe(false);
    await backed(s, a.id, b.id, 59);
    expect(await isBackedByContribution(s, NOW, a.id)).toBe(true);
  });

  it("помощь старше 60 дней не считается", async () => {
    const { s, a, b } = await setup();
    await backed(s, a.id, b.id, 61);
    expect(await isBackedByContribution(s, NOW, a.id)).toBe(false);
  });

  it("помощь, которую человек ПОЛУЧИЛ, вклад не считается", async () => {
    const { s, a, b } = await setup();
    await backed(s, b.id, a.id, 5);
    expect(await isBackedByContribution(s, NOW, a.id)).toBe(false);
  });

  it("новичок: 60 дней отсчитываются от входа в испытательный месяц", async () => {
    const { s } = await setup();
    const fresh = await addMember(s, { status: "probation", number: null, joined_at: ago(10) });
    expect(await isBackedByContribution(s, NOW, fresh.id)).toBe(true);
    const old = await addMember(s, { status: "probation", number: null, joined_at: ago(70) });
    expect(await isBackedByContribution(s, NOW, old.id)).toBe(false);
  });

  it("без вклада «срочно» недоступно", async () => {
    const { s, sphere, a } = await setup();
    await expect(createRequest(s, NOW, reqInput(a.id, sphere.id, { is_urgent: true }))).rejects.toMatchObject({ code: "urgent_not_available" });
  });

  it("очередь: необеспеченные — в конец; среди обеспеченных срочные первыми, потом старые", async () => {
    const { s, sphere, a, b, c } = await setup();
    const d = await addMember(s, { joined_at: ago(400) });
    await backed(s, a.id, b.id);
    await backed(s, c.id, b.id);
    // b — без вклада, но запрос создан раньше всех
    const rb = await createRequest(s, addDays(NOW, -3), reqInput(b.id, sphere.id, { deadline: addDays(NOW, 9).toISOString() }));
    const ra = await createRequest(s, addDays(NOW, -2), reqInput(a.id, sphere.id));
    const rc = await createRequest(s, addDays(NOW, -1), reqInput(c.id, sphere.id, { is_urgent: true }));
    const board = await listBoard(s, NOW, d.id);
    expect(board.requests.map((r) => r.request.id)).toEqual([rc.id, ra.id, rb.id]);
    expect(board.requests.map((r) => r.backed)).toEqual([true, true, false]);
  });
});

describe("доска: деликатные запросы", () => {
  it("видят автор, выбранные и Совет/создатель; посторонние — нет", async () => {
    const { s, sphere, a, b, c } = await setup();
    const chosen = await addMember(s);
    const council = await addMember(s, { status: "council" });
    await s.t.council_terms.insert({ member_id: council.id, starts_on: ago(10), ends_on: addDays(NOW, 300).toISOString(), term_no: 1, warned_at: null });
    const creator = await addMember(s, { is_creator: true });
    await createRequest(s, NOW, reqInput(a.id, sphere.id, { is_sensitive: true, visible_to: [chosen.id] }));

    const see = async (id: string) => (await listBoard(s, NOW, id)).requests.length;
    expect(await see(a.id)).toBe(1);
    expect(await see(chosen.id)).toBe(1);
    expect(await see(council.id)).toBe(1);
    expect(await see(creator.id)).toBe(1);
    expect(await see(b.id)).toBe(0);
    expect(await see(c.id)).toBe(0);
  });

  it("посторонний не может откликнуться на деликатный запрос", async () => {
    const { s, sphere, a, b } = await setup();
    const r = await createRequest(s, NOW, reqInput(a.id, sphere.id, { is_sensitive: true, visible_to: [] }));
    await expect(respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "помогу", mode: "help" })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("доска: отклики и режим «помощь / заказ»", () => {
  it("режим выбирается при отклике и не меняется: ни повторным откликом, ни правкой в хранилище", async () => {
    const { s, sphere, a, b } = await setup();
    const r = await createRequest(s, NOW, reqInput(a.id, sphere.id));
    const resp = await respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "сделаю", mode: "help" });
    await expect(respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "а теперь за деньги", mode: "order" })).rejects.toMatchObject({ code: "already_responded" });
    await expect(s.t.responses.update(resp.id, { mode: "order" })).rejects.toBeInstanceOf(ConstraintError);
    expect((await s.t.responses.get(resp.id))!.mode).toBe("help");
  });

  it("на свой запрос откликнуться нельзя; режим только help или order", async () => {
    const { s, sphere, a, b } = await setup();
    const r = await createRequest(s, NOW, reqInput(a.id, sphere.id));
    await expect(respondToRequest(s, NOW, { request_id: r.id, responder_id: a.id, message: "я", mode: "help" })).rejects.toBeInstanceOf(DomainError);
    await expect(respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "я", mode: "что-то" as never })).rejects.toBeInstanceOf(DomainError);
  });

  it("автор выбирает одного или нескольких; чужие не выбирают", async () => {
    const { s, sphere, a, b, c } = await setup();
    const r = await createRequest(s, NOW, reqInput(a.id, sphere.id));
    const rb = await respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "я", mode: "help" });
    const rc = await respondToRequest(s, NOW, { request_id: r.id, responder_id: c.id, message: "я", mode: "order" });
    await expect(chooseResponders(s, NOW, r.id, b.id, [rb.id])).rejects.toBeInstanceOf(AccessError);
    await chooseResponders(s, NOW, r.id, a.id, [rb.id, rc.id]);
    expect((await s.t.responses.list({ request_id: r.id })).every((x) => x.is_chosen)).toBe(true);
  });
});

describe("подтверждение помощи (confirmHelp)", () => {
  const input = (helper: string, receiver: string, sphere: string, over: Record<string, unknown> = {}) => ({
    actor_id: receiver, helper_id: helper, receiver_id: receiver, sphere_id: sphere, grade: 3 as const, review: "Спасибо, всё получилось", ...over,
  });

  it("подтверждает только получатель", async () => {
    const { s, sphere, a, b } = await setup();
    await expect(confirmHelp(s, NOW, input(a.id, b.id, sphere.id, { actor_id: a.id }))).rejects.toBeInstanceOf(AccessError);
    expect(await s.t.helps.list()).toHaveLength(0);
    await expect(confirmHelp(s, NOW, input(a.id, b.id, sphere.id))).resolves.toBeTruthy();
  });

  it("оценка только 1, 3 или 6; сфера существует; отзыв не пустой и короткий", async () => {
    const { s, sphere, a, b } = await setup();
    await expect(confirmHelp(s, NOW, input(a.id, b.id, sphere.id, { grade: 2 }))).rejects.toBeInstanceOf(DomainError);
    await expect(confirmHelp(s, NOW, input(a.id, b.id, "нет"))).rejects.toBeInstanceOf(DomainError);
    await expect(confirmHelp(s, NOW, input(a.id, b.id, sphere.id, { review: "  " }))).rejects.toBeInstanceOf(DomainError);
    await expect(confirmHelp(s, NOW, input(a.id, b.id, sphere.id, { review: "я".repeat(501) }))).rejects.toBeInstanceOf(DomainError);
  });

  it("подтверждение даёт помощнику 1 кредит; на потолке 4 кредит не начисляется, помощь всё равно записана", async () => {
    const { s, sphere, a, b } = await setup();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await confirmHelp(s, NOW, input(a.id, b.id, sphere.id)));
    expect(results.map((r) => r.credit_granted)).toEqual([true, true, true, true, false]);
    expect((await creditBalance(s, a.id)).available).toBe(4);
    expect(await s.t.helps.list()).toHaveLength(5);
  });

  it("помощь по запросу закрывает запрос; помощник должен быть выбран и откликаться в режиме «помощь»", async () => {
    const { s, sphere, a, b, c } = await setup();
    const r = await createRequest(s, NOW, reqInput(a.id, sphere.id));
    const rb = await respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "помогу", mode: "help" });
    const rc = await respondToRequest(s, NOW, { request_id: r.id, responder_id: c.id, message: "за деньги", mode: "order" });
    await chooseResponders(s, NOW, r.id, a.id, [rb.id, rc.id]);

    // «заказ» — без Пульса и кредита
    await expect(confirmHelp(s, NOW, input(c.id, a.id, sphere.id, { request_id: r.id }))).rejects.toMatchObject({ code: "order_mode" });
    // не выбранный — нельзя
    const outsider = await addMember(s);
    await expect(confirmHelp(s, NOW, input(outsider.id, a.id, sphere.id, { request_id: r.id }))).rejects.toMatchObject({ code: "not_chosen" });

    const ok = await confirmHelp(s, NOW, input(b.id, a.id, sphere.id, { request_id: r.id }));
    expect(ok.help.request_id).toBe(r.id);
    const closed = (await s.t.requests.get(r.id))!;
    expect(closed).toMatchObject({ status: "closed", closed_by_help: true });
  });

  it("если получатель — новичок с первой помощью в ожидании, статус first_help становится helped", async () => {
    const { s, sphere, a } = await setup();
    const newbie = await addMember(s, { status: "probation", number: null, joined_at: ago(3) });
    const fh = await s.t.first_help.insert({ member_id: newbie.id, main_request: "найти Steuerberater", sponsor_id: null, talk_deadline: addDays(NOW, 11).toISOString(), status: "pending", helped_at: null, created_at: ago(3) });
    await confirmHelp(s, NOW, input(a.id, newbie.id, sphere.id));
    expect(await s.t.first_help.get(fh.id)).toMatchObject({ status: "helped", helped_at: NOW.toISOString() });
  });

  it("вышедшему участнику помощь не подтвердить, и сам вышедший не подтверждает", async () => {
    const { s, sphere, a, b } = await setup();
    const gone = await addMember(s, { status: "left" });
    await expect(confirmHelp(s, NOW, input(gone.id, b.id, sphere.id))).rejects.toBeInstanceOf(DomainError);
    await expect(confirmHelp(s, NOW, input(a.id, gone.id, sphere.id))).rejects.toBeInstanceOf(DomainError);
  });
});

describe("дежурный по доске", () => {
  async function hung() {
    const base = await setup();
    const { s, sphere, a } = base;
    const duty = await addMember(s);
    const r = await createRequest(s, addHours(NOW, -50), reqInput(a.id, sphere.id, { deadline: addDays(NOW, 5).toISOString() }));
    await assignDuty(s, NOW, duty.id);
    return { ...base, duty, r };
  }

  it("запрос старше 48 часов без отклика попадает дежурному; свежий — нет", async () => {
    const { s, r } = await hung();
    expect((await hungRequests(s, NOW)).map((x) => x.id)).toEqual([r.id]);
    expect(await hungRequests(s, addHours(NOW, -10))).toHaveLength(0);
  });

  it("с откликом запрос дежурному не нужен", async () => {
    const { s, r, b } = await hung();
    await respondToRequest(s, NOW, { request_id: r.id, responder_id: b.id, message: "могу", mode: "help" });
    expect(await hungRequests(s, NOW)).toHaveLength(0);
  });

  it("деликатные запросы дежурному не показываются", async () => {
    const base = await setup();
    const { s, sphere, a } = base;
    await createRequest(s, addHours(NOW, -50), reqInput(a.id, sphere.id, { is_sensitive: true, deadline: addDays(NOW, 5).toISOString() }));
    expect(await hungRequests(s, NOW)).toHaveLength(0);
  });

  it("дежурный отмечает двоих; после двух отметок запрос уходит из списка", async () => {
    const { s, r, duty, b, c } = await hung();
    await recordPing(s, NOW, { request_id: r.id, duty_id: duty.id, pinged_id: b.id });
    expect(await hungRequests(s, NOW)).toHaveLength(1);
    await recordPing(s, NOW, { request_id: r.id, duty_id: duty.id, pinged_id: c.id });
    expect(await hungRequests(s, NOW)).toHaveLength(0);
    expect(await s.t.duty_pings.list({ request_id: r.id })).toHaveLength(2);
  });

  it("отметить может только текущий дежурный; нельзя дважды одного и того же и автора запроса", async () => {
    const { s, r, a, b, c, duty } = await hung();
    await expect(recordPing(s, NOW, { request_id: r.id, duty_id: c.id, pinged_id: b.id })).rejects.toBeInstanceOf(AccessError);
    await recordPing(s, NOW, { request_id: r.id, duty_id: duty.id, pinged_id: b.id });
    await expect(recordPing(s, NOW, { request_id: r.id, duty_id: duty.id, pinged_id: b.id })).rejects.toMatchObject({ code: "duplicate_ping" });
    await expect(recordPing(s, NOW, { request_id: r.id, duty_id: duty.id, pinged_id: a.id })).rejects.toBeInstanceOf(DomainError);
  });

  it("дежурный на неделю один; назначение заменяет прежнее в ту же неделю; неделя идёт с понедельника по Берлину", async () => {
    const { s, a, b } = await setup();
    await assignDuty(s, NOW, a.id); // 11 октября 2026 — воскресенье
    expect((await currentDuty(s, NOW))!.id).toBe(a.id);
    await assignDuty(s, NOW, b.id);
    expect((await currentDuty(s, NOW))!.id).toBe(b.id);
    expect(await s.t.duty_roster.list()).toHaveLength(1);
    // понедельник 12 октября — новая неделя, дежурного ещё нет
    expect(await currentDuty(s, new Date("2026-10-12T10:00:00Z"))).toBeUndefined();
  });
});

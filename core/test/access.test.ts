import { describe, expect, it } from "vitest";
import { getPublicHelpHistory, getPulseFor, isCouncilMember, isStaff, listExternalCircle } from "../src/access";
import { publicDecisionText, recordDecision, startTerm, sweepEndedTerms, termsEndingSoon } from "../src/council";
import { addDays, addMonths } from "../src/time";
import { AccessError, DomainError } from "../src/types";
import { NOW, addMember, newStore } from "./helpers";

const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

async function setup() {
  const s = await newStore();
  const sphere = (await s.t.spheres.list())[0];
  const creator = await addMember(s, { is_creator: true, status: "council" });
  const councilor = await addMember(s, { status: "council" });
  await s.t.council_terms.insert({ member_id: councilor.id, starts_on: ago(10), ends_on: addDays(NOW, 355).toISOString(), term_no: 1, warned_at: null });
  const a = await addMember(s, { name: "Анна" });
  const b = await addMember(s, { name: "Борис" });
  await s.t.helps.insert({ helper_id: a.id, receiver_id: b.id, sphere_id: sphere.id, grade: 6, review: "Выручила с договором", request_id: null, created_at: ago(3), confirmed_at: ago(3) });
  return { s, sphere, creator, councilor, a, b };
}

describe("доступ: RLS-замена", () => {
  it("чужой Пульс не читается, свой, Совета и создателя — читается", async () => {
    const { s, creator, councilor, a, b } = await setup();
    await expect(getPulseFor(s, NOW, b.id, a.id)).rejects.toBeInstanceOf(AccessError);
    await expect(getPulseFor(s, NOW, a.id, a.id)).resolves.toHaveProperty("value");
    await expect(getPulseFor(s, NOW, councilor.id, a.id)).resolves.toHaveProperty("value");
    await expect(getPulseFor(s, NOW, creator.id, a.id)).resolves.toHaveProperty("value");
  });

  it("история помощи видна участникам: отзыв и сфера, но без оценки и без Пульса", async () => {
    const { s, a, b } = await setup();
    const history = await getPublicHelpHistory(s, b.id, a.id);
    expect(history).toHaveLength(1);
    expect(history[0].review).toBe("Выручила с договором");
    expect(Object.keys(history[0])).not.toContain("grade");
    expect(JSON.stringify(history)).not.toMatch(/pulse|grade|value/i);
  });

  it("историю помощи не видит кандидат", async () => {
    const { s, a } = await setup();
    const cand = await addMember(s, { status: "candidate", number: null });
    await expect(getPublicHelpHistory(s, cand.id, a.id)).rejects.toBeInstanceOf(AccessError);
  });

  it("внешний круг видят только создатель и Совет", async () => {
    const { s, sphere, creator, councilor, a } = await setup();
    await s.t.external_circle.insert({ name: "Юрист", sphere_id: sphere.id, contact: "t.me/x", notes: "проверенный" });
    await expect(listExternalCircle(s, NOW, creator.id)).resolves.toHaveLength(1);
    await expect(listExternalCircle(s, NOW, councilor.id)).resolves.toHaveLength(1);
    await expect(listExternalCircle(s, NOW, a.id)).rejects.toBeInstanceOf(AccessError);
  });

  it("член Совета — только с действующим сроком", async () => {
    const { s, councilor } = await setup();
    expect(await isCouncilMember(s, councilor.id, NOW)).toBe(true);
    expect(await isCouncilMember(s, councilor.id, addDays(NOW, 400))).toBe(false);
    expect(await isStaff(s, councilor, addDays(NOW, 400))).toBe(false);
  });
});

describe("Совет: сроки, самоотвод, публикация", () => {
  it("срок год; не больше двух подряд; после перерыва можно снова", async () => {
    const { s, a } = await setup();
    const t1 = await startTerm(s, NOW, a.id, NOW);
    expect(t1).toMatchObject({ term_no: 1, ends_on: addMonths(NOW, 12).toISOString() });
    expect((await s.t.members.get(a.id))!.status).toBe("council");
    const t2 = await startTerm(s, NOW, a.id, new Date(t1.ends_on));
    expect(t2.term_no).toBe(2);
    await expect(startTerm(s, NOW, a.id, new Date(t2.ends_on))).rejects.toMatchObject({ code: "term_limit" });
    const afterBreak = await startTerm(s, NOW, a.id, addDays(new Date(t2.ends_on), 40));
    expect(afterBreak.term_no).toBe(1);
  });

  it("бот заранее предупреждает об окончании срока — один раз", async () => {
    const { s, a } = await setup();
    const t = await startTerm(s, NOW, a.id, NOW);
    const end = new Date(t.ends_on);
    const mine = (rows: { id: string; member_id: string }[]) => rows.filter((x) => x.member_id === a.id).map((x) => x.id);
    expect(mine(await termsEndingSoon(s, addDays(end, -60)))).toEqual([]);
    expect(mine(await termsEndingSoon(s, addDays(end, -20)))).toEqual([t.id]);
    expect(mine(await termsEndingSoon(s, addDays(end, -10)))).toEqual([]);
  });

  it("срок закончился: член Совета возвращается к статусу Партнёр", async () => {
    const { s, a } = await setup();
    const t = await startTerm(s, NOW, a.id, NOW);
    await sweepEndedTerms(s, addDays(new Date(t.ends_on), -1));
    expect((await s.t.members.get(a.id))!.status).toBe("council");
    const ended = await sweepEndedTerms(s, addDays(new Date(t.ends_on), 1));
    expect(ended.map((m) => m.id)).toContain(a.id);
    expect((await s.t.members.get(a.id))!.status).toBe("partner");
  });

  it("публичный текст решения: причина есть, имён и ников нет", async () => {
    const { s, creator, a, b } = await setup();
    await s.t.members.update(b.id, { sponsor_id: a.id, tg_username: "boris_x" });
    const d = await recordDecision(s, NOW, { kind: "admission", subject_id: b.id, by: creator.id, reason: "сильная анкета, конкретная цель" });
    const text = publicDecisionText(d, await s.t.members.get(b.id));
    expect(text).toContain("сильная анкета, конкретная цель");
    expect(text).not.toMatch(/Борис|boris_x|Анна/);
  });

  it("по «своим» не решают: поручитель кандидата решение принять не может, другой член Совета — может", async () => {
    const { s, councilor, creator, b } = await setup();
    await s.t.members.update(b.id, { sponsor_id: councilor.id });
    await expect(recordDecision(s, NOW, { kind: "rejection", subject_id: b.id, by: councilor.id, reason: "причина" })).rejects.toMatchObject({ code: "recused" });
    await expect(recordDecision(s, NOW, { kind: "rejection", subject_id: b.id, by: creator.id, reason: "причина" })).resolves.toBeTruthy();
  });

  it("решение без причины не записывается; посторонний решать не может", async () => {
    const { s, creator, a, b } = await setup();
    await expect(recordDecision(s, NOW, { kind: "expulsion", subject_id: b.id, by: creator.id, reason: "" })).rejects.toBeInstanceOf(DomainError);
    await expect(recordDecision(s, NOW, { kind: "expulsion", subject_id: b.id, by: a.id, reason: "причина" })).rejects.toBeInstanceOf(AccessError);
    expect(await s.t.council_decisions.list()).toHaveLength(0);
  });
});

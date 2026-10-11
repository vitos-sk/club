import { describe, expect, it } from "vitest";
import { getPulseFor } from "../src/access";
import { creditBalance } from "../src/credits";
import { hungRequests } from "../src/duty";
import { computeMetrics } from "../src/metrics";
import { seedClub } from "../src/seed";
import { MemoryStore } from "../src/store/memory";
import { tick } from "../src/tick";
import { addDays } from "../src/time";

const NOW = new Date("2026-10-11T10:00:00Z");

describe("тестовые данные (создатель — основатель №1)", () => {
  it("создаётся без ошибок; создатель — №1, основатель, создатель, его Пульс виден ему и считается", async () => {
    const s = new MemoryStore();
    const { creator } = await seedClub(s, NOW);
    expect(creator).toMatchObject({ number: 1, is_founder: true, is_creator: true, tg_user_id: 100001 });
    const p = await getPulseFor(s, NOW, creator.id, creator.id);
    expect(p.value).toBeGreaterThan(20);
    expect(p.value).toBeLessThanOrEqual(100);
  });

  it("tg id создателя берётся из окружения (опция)", async () => {
    const s = new MemoryStore();
    const { creator } = await seedClub(s, NOW, { creatorTgId: 777_000 });
    expect(creator.tg_user_id).toBe(777_000);
  });

  it("на доске есть зависший запрос, срочный с откликами и деликатный; дежурный назначен", async () => {
    const s = new MemoryStore();
    await seedClub(s, NOW);
    expect((await hungRequests(s, NOW)).length).toBeGreaterThanOrEqual(1);
    const reqs = await s.t.requests.list();
    expect(reqs.some((r) => r.is_urgent)).toBe(true);
    expect(reqs.some((r) => r.is_sensitive)).toBe(true);
    expect((await s.t.duty_roster.list()).length).toBe(1);
  });

  it("у создателя есть кредиты и входящий запрос встречи с кредитом", async () => {
    const s = new MemoryStore();
    const { creator } = await seedClub(s, NOW);
    expect((await creditBalance(s, creator.id)).available).toBeGreaterThan(0);
    const incoming = await s.t.meeting_requests.list({ to_id: creator.id });
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({ uses_credit: true, status: "pending" });
  });

  it("новички: у одного помощь есть, у другого нет; кандидат на проверке ждёт создателя", async () => {
    const s = new MemoryStore();
    await seedClub(s, NOW);
    const prob = await s.t.members.list({ status: "probation" });
    expect(prob).toHaveLength(2);
    const apps = await s.t.applications.list({ status: "review" });
    expect(apps).toHaveLength(1);
    const reviews = await s.t.application_reviews.list({ application_id: apps[0].id });
    expect(reviews).toHaveLength(8); // оценил один проверяющий из двух
  });

  it("месячный отчёт собирается, все десять метрик на месте", async () => {
    const s = new MemoryStore();
    await seedClub(s, NOW);
    const r = await computeMetrics(s, NOW, "2026-09");
    expect(r.metrics).toHaveLength(10);
  });

  it("плановые задачи после сброса уже создали письма, а повторный запуск ничего не дублирует", async () => {
    const s = new MemoryStore();
    await seedClub(s, NOW);
    const before = (await s.t.notifications.list()).length;
    expect(before).toBeGreaterThan(0);
    const again = await tick(s, NOW);
    expect(again.created).toBe(0);
  });

  it("через месяц испытательный без помощи заканчивается выходом (машина времени работает)", async () => {
    const s = new MemoryStore();
    await seedClub(s, NOW);
    await tick(s, addDays(NOW, 6));
    const lena = (await s.t.members.list()).find((m) => m.name === "Лена З.")!;
    expect(lena.status).toBe("left");
  });
});

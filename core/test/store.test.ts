import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory";
import { ConstraintError } from "../src/types";
import { mkHelp, mkMember, mkRequest } from "./helpers";

describe("MemoryStore: базовые операции", () => {
  it("insert выдаёт id, get/list/update/remove работают, наружу уходят копии", async () => {
    const s = new MemoryStore();
    const m = await s.t.members.insert(mkMember({ name: "А" }));
    expect(m.id).toBeTruthy();
    m.name = "изменено снаружи";
    expect((await s.t.members.get(m.id))!.name).toBe("А");

    await s.t.members.update(m.id, { name: "Б" });
    expect((await s.t.members.list({ name: "Б" })).length).toBe(1);

    await s.t.members.remove(m.id);
    expect(await s.t.members.get(m.id)).toBeUndefined();
  });

  it("config: значения по умолчанию + переопределения", async () => {
    const s = new MemoryStore();
    expect((await s.getConfig()).credits_max).toBe(4);
    await s.setConfig({ credits_max: 5 });
    expect((await s.getConfig()).credits_max).toBe(5);
    expect((await s.getConfig()).codeword).toBe("Движение");
  });

  it("snapshot/load переносит данные и счётчики id", async () => {
    const a = new MemoryStore();
    await a.t.members.insert(mkMember({ name: "А" }));
    const b = new MemoryStore(a.snapshot());
    const m2 = await b.t.members.insert(mkMember({ name: "Б" }));
    expect((await b.t.members.list()).length).toBe(2);
    expect(new Set((await b.t.members.list()).map((x) => x.id)).size).toBe(2);
    expect(m2.id).toBeTruthy();
  });
});

describe("MemoryStore: ограничения как в базе", () => {
  it("grade только 1, 3 или 6", async () => {
    const s = new MemoryStore();
    const a = await s.t.members.insert(mkMember());
    const b = await s.t.members.insert(mkMember());
    await expect(
      s.t.helps.insert(mkHelp({ helper_id: a.id, receiver_id: b.id, grade: 2 as never })),
    ).rejects.toThrow(ConstraintError);
    await expect(
      s.t.helps.insert(mkHelp({ helper_id: a.id, receiver_id: b.id, grade: 3 })),
    ).resolves.toBeTruthy();
  });

  it("нельзя подтвердить помощь самому себе", async () => {
    const s = new MemoryStore();
    const a = await s.t.members.insert(mkMember());
    await expect(s.t.helps.insert(mkHelp({ helper_id: a.id, receiver_id: a.id }))).rejects.toThrow(ConstraintError);
  });

  it("один активный запрос на человека (частичный уникальный индекс)", async () => {
    const s = new MemoryStore();
    const a = await s.t.members.insert(mkMember());
    const first = await s.t.requests.insert(mkRequest({ author_id: a.id }));
    await expect(s.t.requests.insert(mkRequest({ author_id: a.id }))).rejects.toThrow(ConstraintError);
    // закрытый запрос индекс не занимает
    await s.t.requests.update(first.id, { status: "closed" });
    await expect(s.t.requests.insert(mkRequest({ author_id: a.id }))).resolves.toBeTruthy();
  });

  it("одно активное предложение на человека", async () => {
    const s = new MemoryStore();
    const a = await s.t.members.insert(mkMember());
    const base = { author_id: a.id, text: "t", sphere_id: "s", is_active: true, created_at: "2026-01-01T00:00:00Z" };
    await s.t.offers.insert(base);
    await expect(s.t.offers.insert(base)).rejects.toThrow(ConstraintError);
    await expect(s.t.offers.insert({ ...base, is_active: false })).resolves.toBeTruthy();
  });

  it("отклик: один на запрос от человека; режим не меняется", async () => {
    const s = new MemoryStore();
    const r = { request_id: "r1", responder_id: "m1", message: "я", mode: "help" as const, is_chosen: false, created_at: "2026-01-01T00:00:00Z" };
    const resp = await s.t.responses.insert(r);
    await expect(s.t.responses.insert(r)).rejects.toThrow(ConstraintError);
    await expect(s.t.responses.update(resp.id, { mode: "order" })).rejects.toThrow(ConstraintError);
    await expect(s.t.responses.update(resp.id, { is_chosen: true })).resolves.toBeTruthy();
  });

  it("номер и tg id участника уникальны", async () => {
    const s = new MemoryStore();
    await s.t.members.insert(mkMember({ number: 5, tg_user_id: 111 }));
    await expect(s.t.members.insert(mkMember({ number: 5 }))).rejects.toThrow(ConstraintError);
    await expect(s.t.members.insert(mkMember({ tg_user_id: 111 }))).rejects.toThrow(ConstraintError);
    await expect(s.t.members.insert(mkMember({ number: null, tg_user_id: null }))).resolves.toBeTruthy();
    await expect(s.t.members.insert(mkMember({ number: null, tg_user_id: null }))).resolves.toBeTruthy();
  });

  it("отклонённая вставка не оставляет следов", async () => {
    const s = new MemoryStore();
    const a = await s.t.members.insert(mkMember());
    await s.t.requests.insert(mkRequest({ author_id: a.id }));
    await s.t.requests.insert(mkRequest({ author_id: a.id })).catch(() => undefined);
    expect((await s.t.requests.list()).length).toBe(1);
  });
});

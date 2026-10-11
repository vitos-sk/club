import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { advanceClock, clockNow, resetClock } from "../src/clock";
import { JsonFileStore } from "../src/store/jsonfile";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "club-store-"));
  dirs.push(d);
  return join(d, "store.json");
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("JsonFileStore", () => {
  it("записывает изменения в файл и поднимает их при следующем запуске", async () => {
    const file = tmp();
    const a = new JsonFileStore(file);
    const m = await a.t.spheres.insert({ name: "Работа", sort: 1 });
    await a.setConfig({ credits_max: 5 });
    const b = new JsonFileStore(file);
    expect((await b.t.spheres.get(m.id))!.name).toBe("Работа");
    expect((await b.getConfig()).credits_max).toBe(5);
    const next = await b.t.spheres.insert({ name: "Быт", sort: 2 });
    expect(next.id).not.toBe(m.id);
  });

  it("isEmpty: пустой файл — данных нет", () => {
    expect(new JsonFileStore(tmp()).isEmpty()).toBe(true);
  });

  it("битый файл не роняет приложение: начинаем с пустого и сохраняем копию", () => {
    const file = tmp();
    writeFileSync(file, "{не json");
    const s = new JsonFileStore(file);
    expect(s.isEmpty()).toBe(true);
    expect(readFileSync(file + ".broken", "utf8")).toBe("{не json");
  });
});

describe("виртуальные часы (машина времени)", () => {
  it("сдвиг хранится в данных и переживает перезапуск", async () => {
    const file = tmp();
    const a = new JsonFileStore(file);
    const t0 = clockNow(a).getTime();
    advanceClock(a, 3 * 86_400_000);
    const b = new JsonFileStore(file);
    expect(clockNow(b).getTime() - t0).toBeGreaterThanOrEqual(3 * 86_400_000);
    resetClock(b);
    expect(Math.abs(clockNow(b).getTime() - Date.now())).toBeLessThan(1000);
  });
});

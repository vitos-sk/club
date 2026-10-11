import { describe, expect, it } from "vitest";
import { gateToken, safeEqual } from "../src/gate";
import { RemoteJsonStore, UpstashBlobClient, type BlobClient } from "../src/store/remote";

/** Простейшая «удалённая» память для тестов: то же поведение, что у Redis с SET NX. */
class FakeBlob implements BlobClient {
  value: string | null = null;
  sets = 0;
  async get() {
    return this.value;
  }
  async setNx(v: string) {
    if (this.value !== null) return false;
    this.value = v;
    this.sets++;
    return true;
  }
  async set(v: string) {
    this.value = v;
    this.sets++;
  }
}

describe("RemoteJsonStore (данные в удалённом хранилище, для Vercel)", () => {
  it("пустое хранилище: заполняется тестовыми данными один раз и сохраняется", async () => {
    const blob = new FakeBlob();
    let seeded = 0;
    const seed = async (s: RemoteJsonStore) => {
      seeded++;
      await s.t.spheres.insert({ name: "Работа", sort: 1 });
    };
    const a = await RemoteJsonStore.open(blob, seed);
    expect(seeded).toBe(1);
    expect((await a.t.spheres.list()).map((x) => x.name)).toEqual(["Работа"]);
    expect(blob.value).not.toBeNull();

    const b = await RemoteJsonStore.open(blob, seed);
    expect(seeded).toBe(1); // второй раз не заполняем
    expect((await b.t.spheres.list()).map((x) => x.name)).toEqual(["Работа"]);
  });

  it("если параллельный запрос успел заполнить первым — берём его данные, свои не затираем", async () => {
    const blob = new FakeBlob();
    const other = new RemoteJsonStore();
    await other.t.spheres.insert({ name: "Чужая", sort: 1 });
    // между «прочитал пусто» и «записал» кто-то уже записал
    const racing: BlobClient = {
      get: (() => {
        let calls = 0;
        return async () => (calls++ === 0 ? null : blob.value);
      })(),
      setNx: async () => {
        blob.value = JSON.stringify(other.snapshot());
        return false;
      },
      set: (v) => blob.set(v),
    };
    const s = await RemoteJsonStore.open(racing, async (st) => {
      await st.t.spheres.insert({ name: "Моя", sort: 1 });
    });
    expect((await s.t.spheres.list()).map((x) => x.name)).toEqual(["Чужая"]);
  });

  it("изменения помечают хранилище «грязным»; flush записывает их, повторный flush ничего не пишет", async () => {
    const blob = new FakeBlob();
    const s = await RemoteJsonStore.open(blob, async () => {});
    const writes = blob.sets;
    expect(s.isDirty()).toBe(false);
    await s.t.spheres.insert({ name: "Быт", sort: 2 });
    expect(s.isDirty()).toBe(true);
    await s.flush();
    expect(s.isDirty()).toBe(false);
    expect(blob.sets).toBe(writes + 1);
    await s.flush();
    expect(blob.sets).toBe(writes + 1);

    const again = await RemoteJsonStore.open(blob, async () => {});
    expect((await again.t.spheres.list()).map((x) => x.name)).toEqual(["Быт"]);
  });

  it("часы и служебные значения (meta) тоже сохраняются", async () => {
    const blob = new FakeBlob();
    const s = await RemoteJsonStore.open(blob, async () => {});
    s.meta.clock_offset_ms = 86_400_000;
    s.touch();
    await s.flush();
    const again = await RemoteJsonStore.open(blob, async () => {});
    expect(again.meta.clock_offset_ms).toBe(86_400_000);
  });

  it("reset: стирает старое и записывает новые тестовые данные", async () => {
    const blob = new FakeBlob();
    const a = await RemoteJsonStore.open(blob, async (s) => {
      await s.t.spheres.insert({ name: "Старая", sort: 1 });
    });
    await a.t.spheres.insert({ name: "Лишняя", sort: 2 });
    await a.flush();
    const fresh = await RemoteJsonStore.reset(blob, async (s) => {
      await s.t.spheres.insert({ name: "Новая", sort: 1 });
    });
    expect((await fresh.t.spheres.list()).map((x) => x.name)).toEqual(["Новая"]);
    const reopened = await RemoteJsonStore.open(blob, async () => {});
    expect((await reopened.t.spheres.list()).map((x) => x.name)).toEqual(["Новая"]);
  });

  it("битые данные в хранилище не роняют приложение: начинаем заново", async () => {
    const blob = new FakeBlob();
    blob.value = "{не json";
    const s = await RemoteJsonStore.open(blob, async (st) => {
      await st.t.spheres.insert({ name: "Работа", sort: 1 });
    });
    expect((await s.t.spheres.list()).length).toBe(1);
  });
});

describe("UpstashBlobClient (REST-запросы к Upstash Redis)", () => {
  function fakeFetch(reply: (body: unknown[]) => unknown) {
    const calls: { url: string; init: RequestInit; body: unknown[] }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as unknown[];
      calls.push({ url, init, body });
      return new Response(JSON.stringify({ result: reply(body) }), { status: 200 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("get: команда GET с токеном; null, если ключа нет", async () => {
    const { f, calls } = fakeFetch(() => null);
    const c = new UpstashBlobClient("https://x.upstash.io/", "TOKEN", "club:db", f);
    expect(await c.get()).toBeNull();
    expect(calls[0].url).toBe("https://x.upstash.io");
    expect(calls[0].body).toEqual(["GET", "club:db"]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("set и setNx: SET и SET … NX; NX вернёт false, если ключ уже есть", async () => {
    let stored: string | null = null;
    const { f, calls } = fakeFetch((b) => {
      if (b[0] === "SET") {
        if (b.includes("NX") && stored !== null) return null;
        stored = String(b[2]);
        return "OK";
      }
      return stored;
    });
    const c = new UpstashBlobClient("https://x.upstash.io", "T", "k", f);
    expect(await c.setNx("v1")).toBe(true);
    expect(await c.setNx("v2")).toBe(false);
    await c.set("v3");
    expect(await c.get()).toBe("v3");
    expect(calls.map((x) => x.body[0])).toEqual(["SET", "SET", "SET", "GET"]);
    expect(calls[0].body).toEqual(["SET", "k", "v1", "NX"]);
  });

  it("ошибка сервера превращается в понятную ошибку", async () => {
    const f = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const c = new UpstashBlobClient("https://x.upstash.io", "T", "k", f);
    await expect(c.get()).rejects.toThrow(/Upstash/);
  });
});

describe("пароль на публичную ссылку", () => {
  it("токен зависит от пароля и не совпадает с самим паролем", () => {
    const a = gateToken("секрет");
    expect(a).toBe(gateToken("секрет"));
    expect(a).not.toBe(gateToken("другой"));
    expect(a).not.toContain("секрет");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("safeEqual сравнивает строки без утечки по времени и по длине", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

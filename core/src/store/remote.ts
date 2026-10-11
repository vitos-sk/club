import { MemoryStore, type Db } from "./memory";

/**
 * Удалённая «ячейка» для всей базы-заглушки целиком (одна запись JSON).
 * Нужна на Vercel: у серверных функций нет постоянного диска, а экземпляры не делят память.
 */
export interface BlobClient {
  get(): Promise<string | null>;
  /** Записать, только если записи ещё нет. true — записали. */
  setNx(value: string): Promise<boolean>;
  set(value: string): Promise<void>;
}

/** Upstash Redis по REST (подключается в Vercel кнопкой Storage → Upstash Redis). Без сторонних пакетов. */
export class UpstashBlobClient implements BlobClient {
  private url: string;
  constructor(
    url: string,
    private token: string,
    private key: string,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.url = url.replace(/\/+$/, "");
  }

  private async command(body: unknown[]): Promise<unknown> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    let json: { result?: unknown; error?: string } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      /* ответ не JSON — ниже сообщим по статусу */
    }
    if (!res.ok || json.error) throw new Error(`Upstash: ${json.error ?? `HTTP ${res.status}`}`);
    return json.result ?? null;
  }

  async get() {
    const r = await this.command(["GET", this.key]);
    return typeof r === "string" ? r : null;
  }
  async setNx(value: string) {
    return (await this.command(["SET", this.key, value, "NX"])) === "OK";
  }
  async set(value: string) {
    await this.command(["SET", this.key, value]);
  }
}

function parse(raw: string | null): Db | undefined {
  if (!raw) return undefined;
  try {
    const db = JSON.parse(raw) as Db;
    return db && typeof db === "object" && db.tables ? db : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Хранилище, которое грузится из удалённой ячейки на запрос и записывается обратно после изменений (`flush`).
 * Одновременные запросы могут затереть друг друга — для проверки на заглушках это терпимо; настоящую базу ставим позже.
 */
export class RemoteJsonStore extends MemoryStore {
  private dirty = false;
  private blob?: BlobClient;

  constructor(initial?: Db, blob?: BlobClient) {
    super(initial);
    this.blob = blob;
  }

  protected changed(): void {
    this.dirty = true;
  }

  isDirty() {
    return this.dirty;
  }

  /** Записать изменения в ячейку. Если менять было нечего — ничего не делает. */
  async flush(): Promise<void> {
    if (!this.dirty || !this.blob) return;
    await this.blob.set(JSON.stringify(this.snapshot()));
    this.dirty = false;
  }

  /** Загрузить. Если ячейка пуста или повреждена — заполнить тестовыми данными (один раз, без гонок). */
  static async open(blob: BlobClient, seed: (s: RemoteJsonStore) => Promise<void>): Promise<RemoteJsonStore> {
    const raw = await blob.get();
    const existing = parse(raw);
    if (existing) return new RemoteJsonStore(existing, blob);

    const fresh = new RemoteJsonStore(undefined, blob);
    await seed(fresh);
    const json = JSON.stringify(fresh.snapshot());
    if (raw === null) {
      if (!(await blob.setNx(json))) {
        const theirs = parse(await blob.get());
        if (theirs) return new RemoteJsonStore(theirs, blob); // другой запрос успел раньше — берём его данные
        await blob.set(json);
      }
    } else {
      await blob.set(json); // там лежал мусор — перезаписываем
    }
    fresh.dirty = false;
    return fresh;
  }

  /** Стереть всё и заполнить заново. */
  static async reset(blob: BlobClient, seed: (s: RemoteJsonStore) => Promise<void>): Promise<RemoteJsonStore> {
    const fresh = new RemoteJsonStore(undefined, blob);
    await seed(fresh);
    await blob.set(JSON.stringify(fresh.snapshot()));
    fresh.dirty = false;
    return fresh;
  }
}

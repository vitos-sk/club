import { DEFAULT_CONFIG, type Config } from "../config";
import { ConstraintError, TABLE_NAMES, type Id, type TableMap, type TableName } from "../types";
import { CONSTRAINTS } from "./constraints";
import type { NewRow, Store, Table } from "./store";

/** Всё содержимое заглушки; сериализуется в JSON как есть. */
export interface Db {
  tables: { [K in TableName]: TableMap[K][] };
  seq: Record<string, number>;
  config: Partial<Config>;
  meta: Record<string, unknown>;
}

export function emptyDb(): Db {
  const tables = {} as Db["tables"];
  for (const n of TABLE_NAMES) (tables as Record<string, unknown[]>)[n] = [];
  return { tables, seq: {}, config: {}, meta: {} };
}

const clone = <T>(v: T): T => structuredClone(v);

function matches<T extends object>(row: T, where?: Partial<T>): boolean {
  if (!where) return true;
  return (Object.keys(where) as (keyof T)[]).every((k) => row[k] === where[k]);
}

class MemTable<K extends TableName> implements Table<TableMap[K]> {
  constructor(
    private name: K,
    private db: Db,
    private onChange: () => void,
  ) {}

  private get rows(): TableMap[K][] {
    return this.db.tables[this.name] as TableMap[K][];
  }

  private check(next: TableMap[K], prev?: TableMap[K]) {
    const checks = CONSTRAINTS[this.name] as ((n: TableMap[K], o: TableMap[K][], p?: TableMap[K]) => string | null)[] | undefined;
    if (!checks) return;
    const others = this.rows.filter((r) => r.id !== next.id);
    for (const c of checks) {
      const violated = c(next, others, prev);
      if (violated) throw new ConstraintError(this.name, violated);
    }
  }

  async list(where?: Partial<TableMap[K]>) {
    return this.rows.filter((r) => matches(r as object, where as object)).map(clone);
  }

  async get(id: Id) {
    const r = this.rows.find((x) => x.id === id);
    return r ? clone(r) : undefined;
  }

  async insert(row: NewRow<TableMap[K]>) {
    let id = row.id;
    if (!id) {
      const n = (this.db.seq[this.name] ?? 0) + 1;
      id = String(n);
      this.db.seq[this.name] = n;
    }
    const next = { ...clone(row), id } as TableMap[K];
    this.check(next);
    this.rows.push(next);
    this.onChange();
    return clone(next);
  }

  async update(id: Id, patch: Partial<Omit<TableMap[K], "id">>) {
    const idx = this.rows.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error(`${this.name}: нет строки ${id}`);
    const prev = this.rows[idx];
    const next = { ...prev, ...clone(patch), id } as TableMap[K];
    this.check(next, prev);
    this.rows[idx] = next;
    this.onChange();
    return clone(next);
  }

  async remove(id: Id) {
    const idx = this.rows.findIndex((x) => x.id === id);
    if (idx >= 0) {
      this.rows.splice(idx, 1);
      this.onChange();
    }
  }
}

export class MemoryStore implements Store {
  protected db: Db;
  t: Store["t"];

  constructor(initial?: Db) {
    this.db = initial ? clone(initial) : emptyDb();
    // на случай загрузки старого файла без новых таблиц
    for (const n of TABLE_NAMES) (this.db.tables as Record<string, unknown[]>)[n] ??= [];
    const t = {} as Record<string, unknown>;
    for (const n of TABLE_NAMES) t[n] = new MemTable(n, this.db, () => this.changed());
    this.t = t as Store["t"];
  }

  get meta() {
    return this.db.meta;
  }

  async getConfig(): Promise<Config> {
    return { ...DEFAULT_CONFIG, ...clone(this.db.config) };
  }

  async setConfig(patch: Partial<Config>) {
    this.db.config = { ...this.db.config, ...clone(patch) };
    this.changed();
  }

  /** Полная копия данных (для JSON-файла и тестов). */
  snapshot(): Db {
    return clone(this.db);
  }

  /** Хук для наследников (JsonFileStore сохраняет файл). */
  protected changed(): void {}

  /** Вызвать после правки meta вручную. */
  touch() {
    this.changed();
  }
}

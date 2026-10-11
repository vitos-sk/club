import type { Config } from "../config";
import type { Id, TableMap, TableName } from "../types";

export type NewRow<T> = Omit<T, "id"> & { id?: Id };

/**
 * Таблица. Интерфейс намеренно маленький: так его легко реализовать поверх Supabase.
 * `where` — сравнение полей через ===.
 */
export interface Table<T extends { id: Id }> {
  list(where?: Partial<T>): Promise<T[]>;
  get(id: Id): Promise<T | undefined>;
  insert(row: NewRow<T>): Promise<T>;
  update(id: Id, patch: Partial<Omit<T, "id">>): Promise<T>;
  remove(id: Id): Promise<void>;
}

export interface Store {
  t: { [K in TableName]: Table<TableMap[K]> };
  getConfig(): Promise<Config>;
  setConfig(patch: Partial<Config>): Promise<void>;
  /** Служебные значения заглушки (например, сдвиг часов в симуляторе). */
  meta: Record<string, unknown>;
}

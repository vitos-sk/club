import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MemoryStore, type Db } from "./memory";

/**
 * Заглушка с сохранением: те же данные в памяти, после каждого изменения — запись в JSON-файл.
 * Нужна, чтобы приложение не теряло данные при перезапуске. Файл лежит в .data/ (не коммитится).
 */
export class JsonFileStore extends MemoryStore {
  private empty: boolean;

  constructor(private file: string) {
    let initial: Db | undefined;
    let broken = false;
    if (existsSync(file)) {
      try {
        initial = JSON.parse(readFileSync(file, "utf8")) as Db;
      } catch {
        broken = true;
        try {
          writeFileSync(file + ".broken", readFileSync(file, "utf8"));
        } catch {
          /* копию сохранить не вышло — не критично */
        }
      }
    }
    super(initial);
    this.empty = !initial || broken;
  }

  /** true, если файла не было (или он битый): пора заполнить тестовыми данными. */
  isEmpty(): boolean {
    return this.empty;
  }

  protected changed(): void {
    // super() ещё не закончил — файла в этот момент нет, писать нечего
    if (!this.file) return;
    this.empty = false;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.snapshot()));
    renameSync(tmp, this.file);
  }
}

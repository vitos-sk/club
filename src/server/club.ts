import "server-only";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { cookies } from "next/headers";
import { clockNow } from "@core/clock";
import { isStaff } from "@core/access";
import { INSIDE_STATUSES, type Member } from "@core/types";
import { seedClub, VISITORS, type Persona } from "@core/seed";
import { JsonFileStore } from "@core/store/jsonfile";
import { RemoteJsonStore, UpstashBlobClient } from "@core/store/remote";
import type { Store } from "@core/store/store";
import { tick } from "@core/tick";
import { cache } from "react";

/**
 * Серверная часть приложения на заглушках: одно хранилище на процесс, данные лежат в JSON-файле.
 * Когда появится Supabase, меняется только этот файл: getStore() вернёт реализацию поверх базы.
 */

const G = globalThis as unknown as { __clubStore?: Promise<JsonFileStore> };

export const SESSION_COOKIE = "club_tg";

/** Где лежат данные: Upstash Redis (на Vercel, постоянно) или файл (локально / временный на Vercel). */
export type StorageMode = "upstash" | "file" | "tmp";

function upstash(): UpstashBlobClient | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new UpstashBlobClient(url, token, process.env.STORE_KEY ?? "club:db") : null;
}

export function storageMode(): StorageMode {
  if (upstash()) return "upstash";
  return process.env.VERCEL && !process.env.STORE_FILE ? "tmp" : "file";
}

function storeFile() {
  // на Vercel записывать можно только в /tmp, и то лишь до перезапуска функции
  if (process.env.STORE_FILE) return resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORE_FILE);
  return process.env.VERCEL ? "/tmp/club-store.json" : resolve(/*turbopackIgnore: true*/ process.cwd(), ".data/store.json");
}

/** Тестовые данные: ты — основатель №1. */
async function seed(store: Store) {
  const tg = process.env.CREATOR_TG_ID ? Number(process.env.CREATOR_TG_ID) : undefined;
  await seedClub(store, new Date(), { creatorTgId: tg && Number.isFinite(tg) ? tg : undefined });
}

/** Облачное хранилище грузим один раз на запрос (React cache), файловое держим в памяти процесса. */
const loadRemote = cache(async (): Promise<RemoteJsonStore> => RemoteJsonStore.open(upstash()!, (s) => seed(s)));

export async function getStore(): Promise<JsonFileStore | RemoteJsonStore> {
  if (upstash()) return loadRemote();
  G.__clubStore ??= (async () => {
    const store = new JsonFileStore(storeFile());
    if (store.isEmpty()) await seed(store);
    return store;
  })();
  return G.__clubStore;
}

/** Записать изменения в облачное хранилище (для файлового ничего не нужно: оно пишет само). */
export async function flushStore(store: Store): Promise<void> {
  if (store instanceof RemoteJsonStore) await store.flush();
}

/** Стереть данные и заполнить заново. Часы возвращаются к реальному времени. */
export async function resetStore(): Promise<void> {
  const client = upstash();
  if (client) {
    await RemoteJsonStore.reset(client, (s) => seed(s));
    return;
  }
  G.__clubStore = undefined;
  rmSync(storeFile(), { force: true });
  await getStore();
}

export interface Viewer {
  store: JsonFileStore | RemoteJsonStore;
  now: Date;
  tg: number;
  username: string | null;
  displayName: string;
  /** Запись участника, если Telegram-аккаунт уже в системе (кандидат, испытательный, участник…). */
  member: Member | null;
  /** Полноправно внутри клуба: испытательный, участник, партнёр, совет. */
  inside: boolean;
  /** Создатель или член Совета. */
  staff: boolean;
}

/**
 * Кто сейчас смотрит. В заглушке это cookie с Telegram id (выбирается на /dev).
 * TODO(auth): в боевой версии id берётся только из проверенной подписи Telegram (initData) — этап B.
 */
export async function getViewer(): Promise<Viewer> {
  // cookies() первым делом: при сборке Next пробует отрисовать страницы заранее — здесь он остановится,
  // и данные заглушки (тестовые люди, запись файла) во время сборки не создаются.
  const jar = await cookies();
  const store = await getStore();
  const now = clockNow(store);
  await runTickThrottled(store, now);
  await flushStore(store);
  const members = await store.t.members.list();
  const raw = Number(jar.get(SESSION_COOKIE)?.value);
  const creator = members.find((m) => m.is_creator);
  const tg = Number.isFinite(raw) && raw > 0 ? raw : (creator?.tg_user_id ?? 0);
  const member = members.find((m) => m.tg_user_id === tg) ?? null;
  const visitor = VISITORS.find((v) => v.tg_user_id === tg);
  const staff = member ? await isStaff(store, member, now) : false;
  return {
    store,
    now,
    tg,
    username: member?.tg_username ?? visitor?.username ?? null,
    displayName: member?.name ?? visitor?.name ?? `Telegram ${tg}`,
    member,
    inside: !!member && INSIDE_STATUSES.includes(member.status),
    staff,
  };
}

/** Страница для участников клуба: остальных отправляем на вход. */
export async function requireInside(): Promise<Viewer & { member: Member }> {
  const v = await getViewer();
  if (!v.member || !v.inside) {
    const { redirect } = await import("next/navigation");
    redirect("/join");
  }
  return v as Viewer & { member: Member };
}

export async function requireStaff(): Promise<Viewer & { member: Member }> {
  const v = await requireInside();
  if (!v.staff) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
  return v;
}

/** Все, кого можно «надеть» в тестовом режиме: участники и люди снаружи. */
export async function listPersonas(store: Store): Promise<Array<Persona & { member: Member | null }>> {
  const members = await store.t.members.list();
  const out: Array<Persona & { member: Member | null }> = [];
  for (const m of members) {
    if (m.tg_user_id == null) continue;
    out.push({ tg_user_id: m.tg_user_id, username: m.tg_username ?? "", name: m.name ?? "бывший участник", note: "", member: m });
  }
  for (const v of VISITORS) if (!members.some((m) => m.tg_user_id === v.tg_user_id)) out.push({ ...v, member: null });
  return out;
}

/** Плановые задачи: вызываем при каждом открытии приложения (раз в минуту хватит). */
export async function runTickThrottled(store: Store, now: Date): Promise<void> {
  const last = typeof store.meta.last_tick_ms === "number" ? (store.meta.last_tick_ms as number) : 0;
  if (Math.abs(now.getTime() - last) < 60_000) return;
  store.meta.last_tick_ms = now.getTime();
  (store as unknown as { touch?: () => void }).touch?.();
  await tick(store, now);
}

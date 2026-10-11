import "server-only";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { cookies } from "next/headers";
import { clockNow } from "@core/clock";
import { isStaff } from "@core/access";
import { INSIDE_STATUSES, type Member } from "@core/types";
import { seedClub, VISITORS, type Persona } from "@core/seed";
import { JsonFileStore } from "@core/store/jsonfile";
import { tick } from "@core/tick";

/**
 * Серверная часть приложения на заглушках: одно хранилище на процесс, данные лежат в JSON-файле.
 * Когда появится Supabase, меняется только этот файл: getStore() вернёт реализацию поверх базы.
 */

const G = globalThis as unknown as { __clubStore?: Promise<JsonFileStore> };

export const SESSION_COOKIE = "club_tg";

function storeFile() {
  return resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORE_FILE ?? ".data/store.json");
}

export function getStore(): Promise<JsonFileStore> {
  G.__clubStore ??= (async () => {
    const store = new JsonFileStore(storeFile());
    if (store.isEmpty()) {
      const tg = process.env.CREATOR_TG_ID ? Number(process.env.CREATOR_TG_ID) : undefined;
      await seedClub(store, new Date(), { creatorTgId: tg && Number.isFinite(tg) ? tg : undefined });
    }
    return store;
  })();
  return G.__clubStore;
}

/** Стереть данные и заполнить заново. Часы возвращаются к реальному времени. */
export async function resetStore(): Promise<void> {
  G.__clubStore = undefined;
  rmSync(storeFile(), { force: true });
  await getStore();
}

export interface Viewer {
  store: JsonFileStore;
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
export async function listPersonas(store: JsonFileStore): Promise<Array<Persona & { member: Member | null }>> {
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
export async function runTickThrottled(store: JsonFileStore, now: Date): Promise<void> {
  const last = typeof store.meta.last_tick_ms === "number" ? (store.meta.last_tick_ms as number) : 0;
  if (Math.abs(now.getTime() - last) < 60_000) return;
  store.meta.last_tick_ms = now.getTime();
  await tick(store, now);
}

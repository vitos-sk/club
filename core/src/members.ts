import type { Store } from "./store/store";
import { ACTIVE_STATUSES, DomainError, INSIDE_STATUSES, type Id, type Member } from "./types";

export async function requireMember(store: Store, id: Id): Promise<Member> {
  const m = await store.t.members.get(id);
  if (!m) throw new DomainError("not_found", "Не нашёл такого участника.");
  return m;
}

export const isInside = (m: Member) => INSIDE_STATUSES.includes(m.status);
export const isActiveMember = (m: Member) => ACTIVE_STATUSES.includes(m.status);

/** Как показывать человека другим. Вышедшие — всегда «бывший участник». */
export function memberLabel(m: Member | undefined | null): string {
  if (!m) return "бывший участник";
  if (m.status === "left" || m.status === "expelled") return m.name ? `${m.name}` : "бывший участник";
  const num = m.number != null ? `№${m.number}` : "кандидат";
  return m.name ? `${num} ${m.name}` : num;
}

export const normUsername = (u: string) => u.trim().replace(/^@/, "").toLowerCase();

/**
 * Найти участника по ссылке: «@ник», «#7» / «7» (номер клуба), «id:12» (внутренний id) или Telegram id (5+ цифр).
 */
export async function findMemberByRef(store: Store, ref: string): Promise<Member | undefined> {
  const r = ref.trim();
  if (!r) return undefined;
  const all = await store.t.members.list();
  if (r.startsWith("@")) return all.find((m) => m.tg_username === normUsername(r));
  if (r.startsWith("id:")) return all.find((m) => m.id === r.slice(3));
  const digits = r.replace(/^#/, "");
  if (/^\d+$/.test(digits)) {
    if (r.startsWith("#") || digits.length <= 4) {
      const byNumber = all.find((m) => m.number === Number(digits));
      if (byNumber) return byNumber;
    }
    return all.find((m) => m.tg_user_id === Number(digits));
  }
  return all.find((m) => m.tg_username === normUsername(r));
}

/** Размер клуба = посвящённые (есть номер), не вышедшие. */
export async function clubSize(store: Store): Promise<number> {
  const all = await store.t.members.list();
  return all.filter((m) => m.number != null && ["member", "partner", "council", "stopped", "paused"].includes(m.status)).length;
}

export async function listInside(store: Store): Promise<Member[]> {
  return (await store.t.members.list()).filter(isInside);
}

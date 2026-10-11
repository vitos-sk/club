/**
 * Кредиты на встречу. Баланс не хранится — он считается из `credit_ledger` и открытых запросов.
 *
 *  grant   +1  подтверждённая помощь (если на руках меньше credits_max)
 *  reserve −1  запрос встречи с кредитом
 *  release +1  запрос отменён или получатель не встретился к сроку
 *  spend    0  обе стороны нажали «встретились» (кредит уже снят резервом — это отметка для журнала)
 */
import type { Store } from "./store/store";
import type { Id } from "./types";

export interface CreditBalance {
  /** Можно потратить прямо сейчас. */
  available: number;
  /** Зарезервировано под открытые запросы. */
  reserved: number;
  /** Всё, что не потрачено: available + reserved. Именно оно ограничено потолком. */
  unspent: number;
}

export async function creditBalance(store: Store, memberId: Id): Promise<CreditBalance> {
  const ledger = await store.t.credit_ledger.list({ member_id: memberId });
  const available = ledger.reduce((s, e) => s + e.delta, 0);
  const open = await store.t.meeting_requests.list({ from_id: memberId, uses_credit: true });
  const reserved = open.filter((r) => r.status === "pending" || r.status === "postponed").length;
  return { available, reserved, unspent: available + reserved };
}

/** Начислить кредит за подтверждённую помощь. Сверх потолка не начисляется (вернёт false). */
export async function grantCredit(store: Store, now: Date, memberId: Id, helpId: Id): Promise<boolean> {
  const cfg = await store.getConfig();
  const bal = await creditBalance(store, memberId);
  if (bal.unspent >= cfg.credits_max) return false;
  await store.t.credit_ledger.insert({ member_id: memberId, delta: 1, reason: "grant", ref_id: helpId, created_at: now.toISOString() });
  return true;
}

export async function reserveCredit(store: Store, now: Date, memberId: Id, requestId: Id): Promise<void> {
  await store.t.credit_ledger.insert({ member_id: memberId, delta: -1, reason: "reserve", ref_id: requestId, created_at: now.toISOString() });
}

export async function releaseCredit(store: Store, now: Date, memberId: Id, requestId: Id): Promise<void> {
  await store.t.credit_ledger.insert({ member_id: memberId, delta: 1, reason: "release", ref_id: requestId, created_at: now.toISOString() });
}

export async function spendCredit(store: Store, now: Date, memberId: Id, requestId: Id): Promise<void> {
  await store.t.credit_ledger.insert({ member_id: memberId, delta: 0, reason: "spend", ref_id: requestId, created_at: now.toISOString() });
}

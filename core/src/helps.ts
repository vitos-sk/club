/**
 * Подтверждение помощи получателем: кто помог, сфера, оценка 1/3/6, короткий отзыв.
 * Подтверждает ТОЛЬКО получатель. «Заказ» (за деньги) Пульса и кредита не даёт.
 */
import { grantCredit } from "./credits";
import { isInside, requireMember } from "./members";
import type { Store } from "./store/store";
import { AccessError, DomainError, type Grade, type Help, type Id } from "./types";

export interface ConfirmHelpInput {
  actor_id: Id; // кто нажимает; должен совпасть с получателем
  helper_id: Id;
  receiver_id: Id;
  sphere_id: Id;
  grade: number;
  review: string;
  request_id?: Id | null;
}

export async function confirmHelp(store: Store, now: Date, input: ConfirmHelpInput): Promise<{ help: Help; credit_granted: boolean }> {
  const cfg = await store.getConfig();
  if (input.actor_id !== input.receiver_id) throw new AccessError("Помощь подтверждает только тот, кому помогли.");
  if (input.helper_id === input.receiver_id) throw new DomainError("self", "Подтвердить помощь самому себе нельзя.");
  if (input.grade !== 1 && input.grade !== 3 && input.grade !== 6) throw new DomainError("bad_grade", "Оценка: 1 — мелочь, 3 — серьёзно, 6 — изменило ситуацию.");
  const review = input.review.trim();
  if (!review) throw new DomainError("review_required", "Напиши короткий отзыв — одно-два предложения.");
  if (review.length > cfg.review_max_chars) throw new DomainError("review_too_long", `Отзыв длиннее ${cfg.review_max_chars} символов. Сократи.`);
  if (!(await store.t.spheres.get(input.sphere_id))) throw new DomainError("bad_sphere", "Такой сферы нет. Выбери одну из списка.");

  const helper = await requireMember(store, input.helper_id);
  const receiver = await requireMember(store, input.receiver_id);
  if (!isInside(helper)) throw new DomainError("helper_not_inside", "Этот человек сейчас не в клубе, помощь ему не засчитать.");
  if (!isInside(receiver)) throw new DomainError("receiver_not_inside", "Подтверждать помощь могут участники клуба.");

  let requestId: Id | null = null;
  if (input.request_id) {
    const req = await store.t.requests.get(input.request_id);
    if (!req) throw new DomainError("not_found", "Не нашёл такой запрос.");
    if (req.author_id !== receiver.id) throw new AccessError("Это не твой запрос.");
    const resp = (await store.t.responses.list({ request_id: req.id, responder_id: helper.id }))[0];
    if (!resp) throw new DomainError("not_chosen", "Этот человек не откликался на запрос.");
    if (resp.mode === "order") throw new DomainError("order_mode", "Он откликнулся как «заказ» (за деньги): Пульс и кредит за заказ не начисляются.");
    if (!resp.is_chosen) throw new DomainError("not_chosen", "Сначала выбери этого человека помощником.");
    requestId = req.id;
  }

  const help = await store.t.helps.insert({
    helper_id: helper.id,
    receiver_id: receiver.id,
    sphere_id: input.sphere_id,
    grade: input.grade as Grade,
    review,
    request_id: requestId,
    created_at: now.toISOString(),
    confirmed_at: now.toISOString(),
  });

  if (requestId) {
    const req = (await store.t.requests.get(requestId))!;
    if (req.status === "active") await store.t.requests.update(req.id, { status: "closed", closed_by_help: true, closed_at: now.toISOString() });
  }

  // гарантия первой помощи: новичок получил помощь
  const fh = (await store.t.first_help.list({ member_id: receiver.id })).find((f) => f.status === "pending" || f.status === "talked");
  if (fh) await store.t.first_help.update(fh.id, { status: "helped", helped_at: now.toISOString() });

  const credit_granted = await grantCredit(store, now, helper.id, help.id);
  return { help, credit_granted };
}

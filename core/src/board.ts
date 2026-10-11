/**
 * Доска запросов и предложений (раздел 7 инструкции).
 */
import { canSeeRequest, isStaff } from "./access";
import { isInside, requireMember } from "./members";
import type { Store } from "./store/store";
import { addDays, monthKey } from "./time";
import { AccessError, DomainError, type Id, type Offer, type Request, type Response, type ResponseMode } from "./types";

const MS_DAY = 86_400_000;

/**
 * «Запрос обеспечен вкладом»: у автора есть подтверждённая помощь КАК ПОМОЩНИКА за последние N дней.
 * Новичку N дней отсчитываются от входа в клуб (contribution_grace_from_join).
 */
export async function isBackedByContribution(store: Store, now: Date, memberId: Id): Promise<boolean> {
  const cfg = await store.getConfig();
  const from = now.getTime() - cfg.backed_by_contribution_days * MS_DAY;
  const helps = await store.t.helps.list({ helper_id: memberId });
  if (helps.some((h) => Date.parse(h.confirmed_at) > from && Date.parse(h.confirmed_at) <= now.getTime())) return true;
  if (cfg.contribution_grace_from_join) {
    const m = await requireMember(store, memberId);
    if (m.joined_at && Date.parse(m.joined_at) > from) return true;
  }
  return false;
}

export interface RequestInput {
  author_id: Id;
  text: string;
  sphere_id: Id;
  deadline: string;
  is_urgent: boolean;
  is_sensitive: boolean;
  visible_to: Id[];
}

async function requireSphere(store: Store, id: Id) {
  const sph = await store.t.spheres.get(id);
  if (!sph) throw new DomainError("bad_sphere", "Такой сферы нет. Выбери одну из списка.");
  return sph;
}

export async function createRequest(store: Store, now: Date, input: RequestInput): Promise<Request> {
  const cfg = await store.getConfig();
  const author = await requireMember(store, input.author_id);
  if (!isInside(author)) throw new DomainError("not_inside", "Записки на доске могут оставлять участники клуба.");
  const text = input.text.trim();
  if (!text) throw new DomainError("text_required", "Напиши, что тебе нужно.");
  await requireSphere(store, input.sphere_id);
  if (!(Date.parse(input.deadline) > now.getTime())) throw new DomainError("bad_deadline", "Срок должен быть в будущем.");

  const mine = await store.t.requests.list({ author_id: author.id });
  if (mine.some((r) => r.status === "active")) {
    throw new DomainError("one_active_request", "У тебя уже есть активный запрос. Закрой или отмени его, потом создашь новый.");
  }

  if (input.is_urgent) {
    if (!(await isBackedByContribution(store, now, author.id))) {
      throw new DomainError("urgent_not_available", "Пометка «срочно» недоступна: за последние 60 дней у тебя нет подтверждённой помощи другим.");
    }
    const usedThisMonth = mine.filter((r) => r.is_urgent && monthKey(new Date(r.created_at)) === monthKey(now)).length;
    if (usedThisMonth >= cfg.urgent_per_month) {
      throw new DomainError("urgent_used", "«Срочно» можно раз в календарный месяц, в этом месяце оно уже было.");
    }
  }

  return store.t.requests.insert({
    author_id: author.id,
    text,
    sphere_id: input.sphere_id,
    deadline: input.deadline,
    is_urgent: input.is_urgent,
    is_sensitive: input.is_sensitive,
    visible_to: input.is_sensitive ? [...new Set(input.visible_to)] : [],
    status: "active",
    closed_by_help: false,
    closed_at: null,
    created_at: now.toISOString(),
  });
}

export async function cancelRequest(store: Store, now: Date, requestId: Id, by: Id): Promise<Request> {
  const r = await store.t.requests.get(requestId);
  if (!r) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (r.author_id !== by) throw new AccessError("Отменить запрос может только автор.");
  if (r.status !== "active") throw new DomainError("closed", "Этот запрос уже закрыт.");
  return store.t.requests.update(r.id, { status: "canceled", closed_at: now.toISOString() });
}

/** Плановая задача: запросы с прошедшим сроком становятся expired. */
export async function expireRequests(store: Store, now: Date): Promise<Request[]> {
  const out: Request[] = [];
  for (const r of await store.t.requests.list({ status: "active" })) {
    if (Date.parse(r.deadline) < now.getTime()) out.push(await store.t.requests.update(r.id, { status: "expired", closed_at: now.toISOString() }));
  }
  return out;
}

export async function createOffer(store: Store, now: Date, input: { author_id: Id; text: string; sphere_id: Id }): Promise<Offer> {
  const author = await requireMember(store, input.author_id);
  if (!isInside(author)) throw new DomainError("not_inside", "Предложения могут оставлять участники клуба.");
  const text = input.text.trim();
  if (!text) throw new DomainError("text_required", "Напиши, чем можешь помочь.");
  await requireSphere(store, input.sphere_id);
  const mine = await store.t.offers.list({ author_id: author.id, is_active: true });
  if (mine.length > 0) throw new DomainError("one_active_offer", "У тебя уже есть активное предложение. Выключи его, потом создашь новое.");
  return store.t.offers.insert({ author_id: author.id, text, sphere_id: input.sphere_id, is_active: true, created_at: now.toISOString() });
}

export async function deactivateOffer(store: Store, offerId: Id, by: Id): Promise<Offer> {
  const o = await store.t.offers.get(offerId);
  if (!o) throw new DomainError("not_found", "Не нашёл такое предложение.");
  if (o.author_id !== by) throw new AccessError("Выключить предложение может только автор.");
  return store.t.offers.update(o.id, { is_active: false });
}

export interface ResponseInput {
  request_id: Id;
  responder_id: Id;
  message: string;
  mode: ResponseMode;
}

/** Отклик. Режим «помощь / заказ» выбирается здесь, до начала работы, и дальше не меняется. */
export async function respondToRequest(store: Store, now: Date, input: ResponseInput): Promise<Response> {
  if (input.mode !== "help" && input.mode !== "order") throw new DomainError("bad_mode", "Режим отклика — «помощь» (бесплатно) или «заказ» (за деньги).");
  const responder = await requireMember(store, input.responder_id);
  if (!isInside(responder)) throw new DomainError("not_inside", "Откликаться могут участники клуба.");
  const req = await store.t.requests.get(input.request_id);
  if (!req) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (req.author_id === responder.id) throw new DomainError("own_request", "На свой запрос откликнуться нельзя.");
  if (!canSeeRequest(req, responder.id, await isStaff(store, responder, now))) throw new AccessError("Этот запрос тебе не виден.");
  if (req.status !== "active") throw new DomainError("closed", "Запрос уже закрыт.");
  const existing = await store.t.responses.list({ request_id: req.id, responder_id: responder.id });
  if (existing.length > 0) throw new DomainError("already_responded", "Ты уже откликнулся на этот запрос. Режим после выбора не меняется.");
  return store.t.responses.insert({
    request_id: req.id,
    responder_id: responder.id,
    message: input.message.trim().slice(0, 500),
    mode: input.mode,
    is_chosen: false,
    created_at: now.toISOString(),
  });
}

/** Автор выбирает одного или нескольких откликнувшихся. */
export async function chooseResponders(store: Store, _now: Date, requestId: Id, authorId: Id, responseIds: Id[]): Promise<Response[]> {
  const req = await store.t.requests.get(requestId);
  if (!req) throw new DomainError("not_found", "Не нашёл такой запрос.");
  if (req.author_id !== authorId) throw new AccessError("Выбирать помощника может только автор запроса.");
  const all = await store.t.responses.list({ request_id: requestId });
  const out: Response[] = [];
  for (const id of responseIds) {
    const resp = all.find((r) => r.id === id);
    if (!resp) throw new DomainError("bad_response", "Такого отклика у этого запроса нет.");
    out.push(await store.t.responses.update(resp.id, { is_chosen: true }));
  }
  return out;
}

export interface BoardLine {
  request: Request;
  backed: boolean;
  responses: number;
}

/**
 * Доска глазами участника. Очередь: обеспеченные вкладом — выше необеспеченных;
 * среди равных «срочно» первыми, потом старые раньше новых.
 */
export async function listBoard(store: Store, now: Date, viewerId: Id) {
  const viewer = await requireMember(store, viewerId);
  if (!isInside(viewer)) throw new AccessError("Доска открыта участникам клуба.");
  const staff = await isStaff(store, viewer, now);
  const requests = (await store.t.requests.list({ status: "active" })).filter((r) => canSeeRequest(r, viewer.id, staff));
  const lines: BoardLine[] = [];
  for (const r of requests) {
    lines.push({
      request: r,
      backed: await isBackedByContribution(store, now, r.author_id),
      responses: (await store.t.responses.list({ request_id: r.id })).length,
    });
  }
  lines.sort(
    (a, b) =>
      Number(b.backed) - Number(a.backed) ||
      Number(b.request.is_urgent) - Number(a.request.is_urgent) ||
      Date.parse(a.request.created_at) - Date.parse(b.request.created_at),
  );
  const offers = (await store.t.offers.list({ is_active: true })).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return { requests: lines, offers };
}

export { addDays };

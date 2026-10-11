/**
 * Слой доступа — замена RLS на время заглушек. Те же правила потом превратятся в политики Postgres:
 *  — свой Пульс видят владелец и Совет (создатель — тоже), остальные — нет;
 *  — деликатный запрос виден автору, выбранным людям и Совету;
 *  — внешний круг — только создатель и Совет;
 *  — помощь подтверждает только получатель (проверка в confirmHelp).
 */
import { pulse, type PulseResult } from "./pulse";
import { formulaAt } from "./pulse";
import type { Store } from "./store/store";
import { AccessError, type ExternalContact, type Help, type Id, type Member, type Request } from "./types";
import { isInside, memberLabel, requireMember } from "./members";

/** Член Совета сейчас = есть действующий срок. */
export async function isCouncilMember(store: Store, memberId: Id, now: Date): Promise<boolean> {
  const terms = await store.t.council_terms.list({ member_id: memberId });
  return terms.some((t) => Date.parse(t.starts_on) <= now.getTime() && now.getTime() < Date.parse(t.ends_on));
}

/** Создатель или член Совета. */
export async function isStaff(store: Store, member: Member, now: Date): Promise<boolean> {
  return member.is_creator || (await isCouncilMember(store, member.id, now));
}

export function canSeeRequest(req: Request, viewerId: Id, staff: boolean): boolean {
  if (req.author_id === viewerId) return true;
  if (!req.is_sensitive) return true;
  return staff || req.visible_to.includes(viewerId);
}

/** Пульс человека. Читать может сам человек, Совет и создатель. */
export async function getPulseFor(store: Store, now: Date, viewerId: Id, targetId: Id): Promise<PulseResult> {
  const viewer = await requireMember(store, viewerId);
  if (viewer.id !== targetId && !(await isStaff(store, viewer, now))) {
    throw new AccessError("Чужой Пульс тебе не виден. Свой — в /me.");
  }
  const versions = await store.t.pulse_formula_versions.list();
  const f = formulaAt(versions, now);
  const [helps, meetings] = await Promise.all([store.t.helps.list(), store.t.meetings.list()]);
  return pulse({ helps, meetings }, targetId, now, f.params);
}

export interface PublicHelpLine {
  help_id: Id;
  helper: string;
  receiver: string;
  sphere_id: Id;
  review: string;
  at: string;
}

/** История помощи человека, как её видят остальные: отзывы и сферы, без оценок и без чисел. */
export async function getPublicHelpHistory(store: Store, viewerId: Id, targetId: Id): Promise<PublicHelpLine[]> {
  const viewer = await requireMember(store, viewerId);
  if (!isInside(viewer)) throw new AccessError("История помощи доступна участникам клуба.");
  const [helps, members] = await Promise.all([store.t.helps.list(), store.t.members.list()]);
  const byId = new Map(members.map((m) => [m.id, m]));
  return helps
    .filter((h) => h.helper_id === targetId)
    .sort((a, b) => Date.parse(b.confirmed_at) - Date.parse(a.confirmed_at))
    .map((h: Help) => ({
      help_id: h.id,
      helper: memberLabel(byId.get(h.helper_id)),
      receiver: memberLabel(byId.get(h.receiver_id)),
      sphere_id: h.sphere_id,
      review: h.review,
      at: h.confirmed_at,
    }));
}

/** Внешний круг специалистов — только создатель и Совет. */
export async function listExternalCircle(store: Store, now: Date, viewerId: Id): Promise<ExternalContact[]> {
  const viewer = await requireMember(store, viewerId);
  if (!(await isStaff(store, viewer, now))) throw new AccessError("Внешний круг видят только создатель и Совет.");
  return store.t.external_circle.list();
}

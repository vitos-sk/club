/**
 * Совет: решения, самоотвод, сроки.
 * В этапе A решение фиксирует член Совета или создатель с обязательной причиной (голосование кнопками — позже).
 * Правило «по своим не голосуют» работает автоматически: если поручитель кандидата — тот, кто решает, решение отклоняется.
 */
import { isStaff } from "./access";
import { requireMember } from "./members";
import type { Store } from "./store/store";
import { addMonths } from "./time";
import { AccessError, DomainError, type CouncilDecision, type CouncilTerm, type DecisionKind, type Id, type Member } from "./types";

export async function assertStaff(store: Store, now: Date, memberId: Id): Promise<Member> {
  const m = await requireMember(store, memberId);
  if (!(await isStaff(store, m, now))) throw new AccessError("Это действие доступно создателю и Совету.");
  return m;
}

export interface DecisionInput {
  kind: DecisionKind;
  subject_id: Id | null;
  by: Id;
  reason: string;
}

export async function recordDecision(store: Store, now: Date, input: DecisionInput): Promise<CouncilDecision> {
  await assertStaff(store, now, input.by);
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("reason_required", "Нужна причина: решение публикуется вместе с ней.");
  if (input.subject_id) {
    const subject = await requireMember(store, input.subject_id);
    if (subject.sponsor_id && subject.sponsor_id === input.by) {
      throw new DomainError("recused", "Ты привёл(а) этого человека — по «своим» не решают. Пусть решит другой член Совета.");
    }
  }
  return store.t.council_decisions.insert({
    kind: input.kind,
    subject_id: input.subject_id,
    decided_by: input.by,
    public_reason: reason,
    created_at: now.toISOString(),
  });
}

/** Текст для канала «Новости NEXT»: решение и причина, без имён и личных деталей. */
export function publicDecisionText(decision: CouncilDecision, subject?: Member | null): string {
  const reason = `Причина: ${decision.public_reason}`;
  switch (decision.kind) {
    case "admission":
      return `Решение Совета: кандидат принят на испытательный месяц. ${reason}`;
    case "rejection":
      return `Решение Совета: кандидату отказано. ${reason}`;
    case "initiation":
      return `Решение Совета: участник${subject?.number ? ` №${subject.number}` : ""} посвящён в клуб. ${reason}`;
    case "probation_override":
      return `Решение Совета: участнику продлён испытательный месяц. ${reason}`;
    case "expulsion":
      return `Решение Совета: участник исключён из клуба. ${reason}`;
    case "fund_payout":
      return `Решение Совета: выплата из фонда одобрена. ${reason}`;
    case "appeal":
      return `Решение по апелляции. ${reason}`;
    case "formula_change":
      return `Решение Совета: изменена формула Пульса. ${reason}`;
  }
}

/** Начать срок члена Совета. Срок — год, не больше двух подряд. */
export async function startTerm(store: Store, now: Date, memberId: Id, startsOn: Date = now): Promise<CouncilTerm> {
  const cfg = await store.getConfig();
  const m = await requireMember(store, memberId);
  const prev = (await store.t.council_terms.list({ member_id: m.id })).sort((a, b) => Date.parse(b.ends_on) - Date.parse(a.ends_on))[0];
  const consecutive = prev && Date.parse(prev.ends_on) >= startsOn.getTime();
  const term_no = consecutive ? prev.term_no + 1 : 1;
  if (term_no > cfg.council_max_consecutive_terms) {
    throw new DomainError("term_limit", `В Совете можно не больше ${cfg.council_max_consecutive_terms} сроков подряд. Нужен перерыв.`);
  }
  const term = await store.t.council_terms.insert({
    member_id: m.id,
    starts_on: startsOn.toISOString(),
    ends_on: addMonths(startsOn, cfg.council_term_months).toISOString(),
    term_no,
    warned_at: null,
  });
  if (m.status === "member" || m.status === "partner") await store.t.members.update(m.id, { status: "council" });
  return term;
}

/** Сроки, которые скоро закончатся. Каждый срок возвращается один раз (ставим warned_at). */
export async function termsEndingSoon(store: Store, now: Date): Promise<CouncilTerm[]> {
  const cfg = await store.getConfig();
  const horizon = now.getTime() + cfg.council_term_warn_days * 86_400_000;
  const out: CouncilTerm[] = [];
  for (const t of await store.t.council_terms.list()) {
    const end = Date.parse(t.ends_on);
    if (!t.warned_at && end > now.getTime() && end <= horizon) out.push(await store.t.council_terms.update(t.id, { warned_at: now.toISOString() }));
  }
  return out;
}

/** Закончившиеся сроки: статус «council» возвращается к «partner» (в Совет попадают с Партнёра). */
export async function sweepEndedTerms(store: Store, now: Date): Promise<Member[]> {
  const out: Member[] = [];
  for (const m of await store.t.members.list({ status: "council" })) {
    const terms = await store.t.council_terms.list({ member_id: m.id });
    const active = terms.some((t) => Date.parse(t.starts_on) <= now.getTime() && now.getTime() < Date.parse(t.ends_on));
    if (terms.length > 0 && !active) out.push(await store.t.members.update(m.id, { status: "partner" }));
  }
  return out;
}

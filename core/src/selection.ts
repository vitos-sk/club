/**
 * Отбор (раздел 8 инструкции):
 * кодовое слово → гость на открытом событии → анкета (8 вопросов) → два проверяющих → звонок →
 * взнос пользой → приём на испытательный месяц → (после месяца с помощью) посвящение и номер.
 * Посвящение, выход и авто-выход — в lifecycle.ts.
 */
import { QUESTIONS } from "./application_text";
import { assertStaff, recordDecision } from "./council";
import { clubSize, normUsername, requireMember } from "./members";
import type { Store } from "./store/store";
import { addDays, addMonths, quarterKey } from "./time";
import {
  AccessError,
  ACTIVE_STATUSES,
  DomainError,
  type Application,
  type ApplicationReview,
  type Attendance,
  type CouncilDecision,
  type EventRow,
  type FirstHelp,
  type Guest,
  type Id,
  type Member,
} from "./types";
import type { Config } from "./config";

// ───── события, гости, явка ─────

export async function createEvent(store: Store, now: Date, input: { by: Id; title: string; starts_at: string; is_open: boolean }): Promise<EventRow> {
  await assertStaff(store, now, input.by);
  const title = input.title.trim();
  if (!title) throw new DomainError("title_required", "Нужно название события.");
  if (Number.isNaN(Date.parse(input.starts_at))) throw new DomainError("bad_date", "Не понял дату события.");
  return store.t.events.insert({ title, starts_at: input.starts_at, is_open: input.is_open, created_by: input.by });
}

export async function markGuest(store: Store, now: Date, input: { by: Id; event_id: Id; tg_user_id?: number; tg_username?: string }): Promise<Guest> {
  await assertStaff(store, now, input.by);
  const ev = await store.t.events.get(input.event_id);
  if (!ev) throw new DomainError("not_found", "Не нашёл такое событие.");
  if (!ev.is_open) throw new DomainError("event_closed", "Гостем можно стать только на открытом событии.");
  if (input.tg_user_id == null && !input.tg_username) throw new DomainError("who", "Укажи @ник или Telegram id гостя.");
  return store.t.guests.insert({
    tg_user_id: input.tg_user_id ?? null,
    tg_username: input.tg_username ? normUsername(input.tg_username) : null,
    event_id: ev.id,
    marked_by: input.by,
    created_at: now.toISOString(),
  });
}

/** Найти отметку гостя по id или нику. Если нашли по нику — запоминаем id. */
export async function findGuest(store: Store, who: { tg_user_id: number; tg_username?: string | null }): Promise<Guest | undefined> {
  const all = await store.t.guests.list();
  const uname = who.tg_username ? normUsername(who.tg_username) : null;
  const hit = all.find((g) => g.tg_user_id === who.tg_user_id) ?? (uname ? all.find((g) => g.tg_username === uname) : undefined);
  if (hit && hit.tg_user_id == null) return store.t.guests.update(hit.id, { tg_user_id: who.tg_user_id });
  return hit;
}

export async function markAttendance(store: Store, now: Date, input: { by: Id; event_id: Id; member_id: Id }): Promise<Attendance> {
  await assertStaff(store, now, input.by);
  if (!(await store.t.events.get(input.event_id))) throw new DomainError("not_found", "Не нашёл такое событие.");
  await requireMember(store, input.member_id);
  const dup = await store.t.attendance.list({ event_id: input.event_id, member_id: input.member_id });
  if (dup.length > 0) return dup[0];
  return store.t.attendance.insert({ event_id: input.event_id, member_id: input.member_id, marked_by: input.by, created_at: now.toISOString() });
}

// ───── кандидат и анкета ─────

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

export async function getApplication(store: Store, memberId: Id): Promise<Application | undefined> {
  const list = await store.t.applications.list({ member_id: memberId });
  return list.sort((a, b) => Number(b.id) - Number(a.id))[0];
}

export type StartResult =
  | { ok: true; member: Member; application: Application; sponsor_error?: string; resumed: boolean }
  | { ok: false; reason: "bad_codeword" | "not_guest" | "already_member" | "rejected" };

export async function startCandidate(
  store: Store,
  now: Date,
  input: { tg_user_id: number; tg_username?: string | null; name?: string | null; codeword: string; sponsor_id?: Id },
): Promise<StartResult> {
  const cfg = await store.getConfig();
  if (norm(input.codeword) !== norm(cfg.codeword)) return { ok: false, reason: "bad_codeword" };

  const existing = (await store.t.members.list({ tg_user_id: input.tg_user_id }))[0];
  if (existing) {
    if (existing.status !== "candidate") return { ok: false, reason: "already_member" };
    const app = await getApplication(store, existing.id);
    if (app?.status === "rejected") return { ok: false, reason: "rejected" };
    if (app) return { ok: true, member: existing, application: app, resumed: true };
  }

  if (!existing) {
    const guest = await findGuest(store, { tg_user_id: input.tg_user_id, tg_username: input.tg_username });
    if (!guest) return { ok: false, reason: "not_guest" };
  }

  const member =
    existing ??
    (await store.t.members.insert({
      tg_user_id: input.tg_user_id,
      tg_username: input.tg_username ? normUsername(input.tg_username) : null,
      number: null,
      name: input.name?.trim() || null,
      niche: null,
      skills: [],
      status: "candidate",
      sponsor_id: null,
      sponsor_since: null,
      joined_at: null,
      laws_signed_at: null,
      paused_until: null,
      is_founder: false,
      is_creator: false,
      probation_until: null,
      left_at: null,
      left_reason: null,
      consent_at: null,
      created_at: now.toISOString(),
    }));

  const application = await store.t.applications.insert({
    member_id: member.id,
    answers: Array(QUESTIONS.length).fill(""),
    short_flags: Array(QUESTIONS.length).fill(false),
    reviewer_ids: [],
    status: "draft",
    call_notes: null,
    main_request: null,
    useful_task_id: null,
    useful_done_at: null,
    reject_reason: null,
    submitted_at: null,
    decided_at: null,
    created_at: now.toISOString(),
  });

  let result: Member = member;
  let sponsor_error: string | undefined;
  if (input.sponsor_id) {
    try {
      result = await attachSponsor(store, now, member.id, input.sponsor_id);
    } catch (e) {
      if (e instanceof DomainError) sponsor_error = e.message;
      else throw e;
    }
  }
  return { ok: true, member: result, application, sponsor_error, resumed: false };
}

/** Закрепить поручителя. Лимит — не больше N кандидатов в квартал; после 30 участников — только Партнёр и выше. */
export async function attachSponsor(store: Store, now: Date, candidateId: Id, sponsorId: Id): Promise<Member> {
  const cfg: Config = await store.getConfig();
  const cand = await requireMember(store, candidateId);
  const sponsor = await requireMember(store, sponsorId);
  if (cand.id === sponsor.id) throw new DomainError("self", "Поручиться за самого себя нельзя.");
  if (cand.status !== "candidate") throw new DomainError("not_candidate", "Поручителя закрепляют только за кандидатом.");
  if (cand.sponsor_id === sponsor.id) return cand;
  if (!ACTIVE_STATUSES.includes(sponsor.status) || sponsor.number == null) {
    throw new DomainError("bad_sponsor", "Поручиться может только посвящённый участник клуба.");
  }
  if (cfg.sponsor_gate_enabled && (await clubSize(store)) >= cfg.sponsor_gate_size && sponsor.status !== "partner" && sponsor.status !== "council") {
    throw new DomainError("sponsor_gate", `В клубе уже ${cfg.sponsor_gate_size} участников: поручителем может быть только Партнёр или выше.`);
  }
  const q = quarterKey(now);
  const used = (await store.t.members.list({ sponsor_id: sponsor.id })).filter((m) => m.sponsor_since && quarterKey(new Date(m.sponsor_since)) === q).length;
  if (used >= cfg.sponsor_limit_per_quarter) {
    throw new DomainError("sponsor_limit", `Поручитель уже закрепил за собой ${cfg.sponsor_limit_per_quarter} кандидатов в этом квартале — больше нельзя.`);
  }
  return store.t.members.update(cand.id, { sponsor_id: sponsor.id, sponsor_since: now.toISOString() });
}

export async function saveAnswer(store: Store, _now: Date, applicationId: Id, questionNo: number, text: string): Promise<{ short: boolean }> {
  const cfg = await store.getConfig();
  const app = await store.t.applications.get(applicationId);
  if (!app) throw new DomainError("not_found", "Не нашёл анкету.");
  if (!Number.isInteger(questionNo) || questionNo < 1 || questionNo > QUESTIONS.length) throw new DomainError("bad_question", "В анкете 8 вопросов.");
  if (app.status !== "draft") throw new DomainError("locked", "Анкета уже отправлена, править нельзя.");
  const t = text.trim();
  if (!t) throw new DomainError("empty", "Пустой ответ не принимаю.");
  const short = t.length < cfg.min_answer_chars;
  const answers = [...app.answers];
  const flags = [...app.short_flags];
  answers[questionNo - 1] = t;
  flags[questionNo - 1] = short;
  await store.t.applications.update(app.id, { answers, short_flags: flags });
  return { short };
}

export async function submitApplication(store: Store, now: Date, applicationId: Id): Promise<Application> {
  const cfg = await store.getConfig();
  const app = await store.t.applications.get(applicationId);
  if (!app) throw new DomainError("not_found", "Не нашёл анкету.");
  if (app.status !== "draft") throw new DomainError("locked", "Анкета уже отправлена.");
  if (app.answers.some((a) => !a.trim())) throw new DomainError("incomplete", "Ответь на все 8 вопросов, потом отправим анкету.");
  const cand = await requireMember(store, app.member_id);

  // двое проверяющих из пула: не кандидат, не поручитель, с наименьшей нагрузкой
  const inReview = await store.t.applications.list({ status: "review" });
  const load = (id: Id) => inReview.filter((a) => a.reviewer_ids.includes(id)).length;
  const pool: Member[] = [];
  for (const id of cfg.reviewer_pool_ids) {
    const m = await store.t.members.get(id);
    if (m && m.id !== cand.id && m.id !== cand.sponsor_id && ACTIVE_STATUSES.includes(m.status)) pool.push(m);
  }
  if (pool.length < 2) throw new DomainError("no_reviewers", "Сейчас некому проверить анкету: нужно двое проверяющих. Создатель уже в курсе.");
  const chosen = pool.map((m, i) => ({ m, i })).sort((a, b) => load(a.m.id) - load(b.m.id) || a.i - b.i).slice(0, 2).map((x) => x.m.id);

  return store.t.applications.update(app.id, { status: "review", reviewer_ids: chosen, submitted_at: now.toISOString() });
}

/** Чистая оценка анкеты: какие вопросы «отказные» и принято ли решение. */
export function evaluateApplication(reviews: ApplicationReview[], reviewerIds: Id[], cfg: Pick<Config, "refuse_rule" | "refusals_to_reject">) {
  const total = QUESTIONS.length;
  const complete = reviewerIds.every((rid) => reviews.filter((r) => r.reviewer_id === rid).length >= total);
  const refused: number[] = [];
  if (complete) {
    for (let q = 1; q <= total; q++) {
      const votes = reviewerIds.map((rid) => reviews.find((r) => r.reviewer_id === rid && r.question_no === q)!.verdict);
      const bad = votes.filter((v) => v === "refuse").length;
      if (cfg.refuse_rule === "any" ? bad >= 1 : bad === votes.length) refused.push(q);
    }
  }
  return { complete, refused, rejected: complete && refused.length >= cfg.refusals_to_reject };
}

export interface ReviewOutcome {
  finished: boolean;
  status?: "call" | "rejected";
  refused: number[];
}

export async function reviewAnswer(
  store: Store,
  now: Date,
  input: { application_id: Id; reviewer_id: Id; question_no: number; verdict: "ok" | "refuse" },
): Promise<ReviewOutcome> {
  const cfg = await store.getConfig();
  const app = await store.t.applications.get(input.application_id);
  if (!app) throw new DomainError("not_found", "Не нашёл анкету.");
  if (!app.reviewer_ids.includes(input.reviewer_id)) throw new AccessError("Эту анкету оцениваешь не ты.");
  if (app.status !== "review") throw new DomainError("not_in_review", "Эта анкета сейчас не на проверке.");
  if (!Number.isInteger(input.question_no) || input.question_no < 1 || input.question_no > QUESTIONS.length) throw new DomainError("bad_question", "В анкете 8 вопросов.");
  if (input.verdict !== "ok" && input.verdict !== "refuse") throw new DomainError("bad_verdict", "Оценка — «ок» или «отказ».");

  const mine = (await store.t.application_reviews.list({ application_id: app.id, reviewer_id: input.reviewer_id })).find((r) => r.question_no === input.question_no);
  if (mine) await store.t.application_reviews.update(mine.id, { verdict: input.verdict });
  else await store.t.application_reviews.insert({ application_id: app.id, reviewer_id: input.reviewer_id, question_no: input.question_no, verdict: input.verdict, created_at: now.toISOString() });

  const reviews = await store.t.application_reviews.list({ application_id: app.id });
  const ev = evaluateApplication(reviews, app.reviewer_ids, cfg);
  if (!ev.complete) return { finished: false, refused: [] };
  const status = ev.rejected ? "rejected" : "call";
  await store.t.applications.update(app.id, {
    status,
    decided_at: ev.rejected ? now.toISOString() : null,
    reject_reason: ev.rejected ? "по анкете" : null,
  });
  return { finished: true, status, refused: ev.refused };
}

// ───── звонок, взнос пользой, приём ─────

export async function recordCall(
  store: Store,
  now: Date,
  input: { by: Id; application_id: Id; notes: string; main_request: string },
): Promise<{ application: Application; first_help: FirstHelp }> {
  await assertStaff(store, now, input.by);
  const app = await store.t.applications.get(input.application_id);
  if (!app) throw new DomainError("not_found", "Не нашёл анкету.");
  if (app.status !== "call" && app.status !== "call_done") throw new DomainError("not_ready", "Звонок назначают после успешной проверки анкеты.");
  if (!input.main_request.trim()) throw new DomainError("main_request_required", "Нужен главный запрос кандидата — дословно со звонка.");
  const member = await requireMember(store, app.member_id);

  const application = await store.t.applications.update(app.id, { status: "call_done", call_notes: input.notes, main_request: input.main_request });
  const existing = (await store.t.first_help.list({ member_id: member.id }))[0];
  const first_help = existing
    ? await store.t.first_help.update(existing.id, { main_request: input.main_request, sponsor_id: member.sponsor_id })
    : await store.t.first_help.insert({
        member_id: member.id,
        main_request: input.main_request,
        sponsor_id: member.sponsor_id,
        talk_deadline: null, // срок +14 дней начинается с испытательного месяца
        status: "pending",
        helped_at: null,
        created_at: now.toISOString(),
      });
  return { application, first_help };
}

export async function chooseUsefulTask(store: Store, _now: Date, applicationId: Id, taskId: Id): Promise<Application> {
  const app = await store.t.applications.get(applicationId);
  if (!app) throw new DomainError("not_found", "Не нашёл анкету.");
  if (app.status !== "call" && app.status !== "call_done") throw new DomainError("not_ready", "Задачу для взноса выбирают после успешной анкеты.");
  const task = await store.t.useful_tasks.get(taskId);
  if (!task || !task.is_active) throw new DomainError("bad_task", "Такой задачи в списке нет.");
  return store.t.applications.update(app.id, { useful_task_id: task.id });
}

export async function acceptCandidate(
  store: Store,
  now: Date,
  input: { by: Id; member_id: Id; reason: string },
): Promise<{ member: Member; decision: CouncilDecision }> {
  const cfg = await store.getConfig();
  await assertStaff(store, now, input.by);
  const member = await requireMember(store, input.member_id);
  const app = await getApplication(store, member.id);
  if (member.status !== "candidate" || !app) throw new DomainError("not_candidate", "Принимать на испытательный месяц можно только кандидата.");
  if (app.status !== "call_done") throw new DomainError("no_call", "Сначала звонок: запиши его итог и главный запрос кандидата.");
  if (!app.useful_task_id) throw new DomainError("no_useful_task", "Кандидат ещё не выбрал задачу для взноса пользой.");
  if (cfg.sponsor_gate_enabled && (await clubSize(store)) >= cfg.sponsor_gate_size) {
    const sp = member.sponsor_id ? await store.t.members.get(member.sponsor_id) : undefined;
    if (!sp || (sp.status !== "partner" && sp.status !== "council")) {
      throw new DomainError("sponsor_required", `В клубе уже ${cfg.sponsor_gate_size} участников: нужен поручитель со статусом Партнёр или выше.`);
    }
  }
  const decision = await recordDecision(store, now, { kind: "admission", subject_id: member.id, by: input.by, reason: input.reason });

  const updated = await store.t.members.update(member.id, {
    status: "probation",
    joined_at: now.toISOString(),
    probation_until: addMonths(now, cfg.probation_months).toISOString(),
  });
  await store.t.applications.update(app.id, { status: "accepted", decided_at: now.toISOString(), useful_done_at: now.toISOString() });
  const fh = (await store.t.first_help.list({ member_id: member.id }))[0];
  if (fh) await store.t.first_help.update(fh.id, { talk_deadline: addDays(now, cfg.first_help_talk_days).toISOString() });
  return { member: updated, decision };
}

export async function rejectCandidate(store: Store, now: Date, input: { by: Id; member_id: Id; reason: string }): Promise<CouncilDecision> {
  await assertStaff(store, now, input.by);
  const member = await requireMember(store, input.member_id);
  const app = await getApplication(store, member.id);
  if (member.status !== "candidate" || !app || app.status === "accepted" || app.status === "draft") {
    throw new DomainError("not_candidate", "Отказать можно кандидату с отправленной анкетой.");
  }
  const decision = await recordDecision(store, now, { kind: "rejection", subject_id: member.id, by: input.by, reason: input.reason });
  await store.t.applications.update(app.id, { status: "rejected", decided_at: now.toISOString(), reject_reason: input.reason.trim() });
  return decision;
}

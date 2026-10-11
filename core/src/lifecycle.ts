/**
 * Жизненный цикл участника: посвящение и номер, подпись законов, авто-выход после пустого испытательного,
 * отмена выхода, выход из клуба (обезличивание), статусы первой помощи.
 */
import { assertStaff, recordDecision } from "./council";
import { releaseCredit } from "./credits";
import { isInside, nextNumber, normUsername, requireMember } from "./members";
import type { Store } from "./store/store";
import { addMonths } from "./time";
import { DomainError, type CouncilDecision, type FirstHelp, type FirstHelpStatus, type Id, type Member } from "./types";

const ms = (iso: string) => Date.parse(iso);

/** Подтверждённая помощь, где человек был помощником, начиная с входа в клуб. */
async function helpsGivenSince(store: Store, m: Member): Promise<number> {
  const since = m.joined_at ? ms(m.joined_at) : 0;
  return (await store.t.helps.list({ helper_id: m.id })).filter((h) => ms(h.confirmed_at) >= since).length;
}

export async function admit(
  store: Store,
  now: Date,
  input: { by: Id; member_id: Id; reason?: string },
): Promise<{ member: Member; decision: CouncilDecision }> {
  const cfg = await store.getConfig();
  await assertStaff(store, now, input.by);
  const m = await requireMember(store, input.member_id);
  if (m.status !== "probation") throw new DomainError("not_probation", "Посвящать можно того, кто сейчас на испытательном месяце.");
  if ((await helpsGivenSince(store, m)) < 1) {
    throw new DomainError("no_help_yet", "У этого человека ещё нет подтверждённой помощи за испытательный месяц — посвящать рано.");
  }
  const decision = await recordDecision(store, now, {
    kind: "initiation",
    subject_id: m.id,
    by: input.by,
    reason: input.reason?.trim() || "помощь в испытательный месяц подтверждена",
  });
  const number = await nextNumber(store);
  const member = await store.t.members.update(m.id, { status: "member", number, is_founder: number <= cfg.founders_count });
  return { member, decision };
}

/** Первые участники ядра вносятся без анкеты. Запись остаётся в журнале Совета. */
export async function admitDirect(
  store: Store,
  now: Date,
  input: { by: Id; member_id?: Id; tg_user_id?: number; tg_username?: string; name: string; reason?: string },
): Promise<Member> {
  const cfg = await store.getConfig();
  await assertStaff(store, now, input.by);
  const name = input.name.trim();
  if (!name) throw new DomainError("name_required", "Нужно имя.");
  const number = await nextNumber(store);
  let member: Member;

  if (input.member_id) {
    const m = await requireMember(store, input.member_id);
    if (m.status !== "candidate" && m.status !== "probation") throw new DomainError("already_member", "Этот человек уже в клубе или вышел.");
    member = await store.t.members.update(m.id, { status: "member", number, is_founder: number <= cfg.founders_count, name, joined_at: m.joined_at ?? now.toISOString() });
  } else {
    if (input.tg_user_id == null && !input.tg_username) throw new DomainError("who", "Укажи @ник или Telegram id.");
    const uname = input.tg_username ? normUsername(input.tg_username) : null;
    const all = await store.t.members.list();
    if (all.some((x) => (input.tg_user_id != null && x.tg_user_id === input.tg_user_id) || (uname && x.tg_username === uname))) {
      throw new DomainError("exists", "Такой человек уже есть в списке.");
    }
    member = await store.t.members.insert({
      tg_user_id: input.tg_user_id ?? null,
      tg_username: uname,
      number,
      name,
      niche: null,
      skills: [],
      status: "member",
      sponsor_id: null,
      sponsor_since: null,
      joined_at: now.toISOString(),
      laws_signed_at: null,
      paused_until: null,
      is_founder: number <= cfg.founders_count,
      is_creator: false,
      probation_until: null,
      left_at: null,
      left_reason: null,
      consent_at: null,
      created_at: now.toISOString(),
    });
  }
  await store.t.council_journal.insert({
    kind: "direct_admit",
    member_id: member.id,
    ref_id: null,
    note: `Принят без анкеты: ${input.reason?.trim() || "ядро клуба"}`,
    created_at: now.toISOString(),
  });
  return member;
}

export async function signLaws(store: Store, now: Date, input: { by: Id; member_id: Id }): Promise<Member> {
  await assertStaff(store, now, input.by);
  const m = await requireMember(store, input.member_id);
  if (!isInside(m)) throw new DomainError("not_inside", "Подпись законов отмечают у участников клуба.");
  if (m.laws_signed_at) return m;
  return store.t.members.update(m.id, { laws_signed_at: now.toISOString() });
}

/**
 * Плановая задача. Месяц закончился:
 *  — нет ни одной подтверждённой помощи → выход по умолчанию (status left, запись в журнал);
 *  — помощь есть → один раз сообщаем «готов к посвящению».
 */
export async function probationSweep(store: Store, now: Date): Promise<{ exited: Member[]; ready: Member[] }> {
  const exited: Member[] = [];
  const ready: Member[] = [];
  for (const m of await store.t.members.list({ status: "probation" })) {
    if (!m.probation_until || ms(m.probation_until) > now.getTime()) continue;
    if ((await helpsGivenSince(store, m)) === 0) {
      exited.push(await store.t.members.update(m.id, { status: "left", left_at: now.toISOString(), left_reason: "probation_empty" }));
      await store.t.council_journal.insert({
        kind: "probation_exit",
        member_id: m.id,
        ref_id: null,
        note: "Испытательный месяц закончился без подтверждённой помощи — выход по умолчанию. Совет может отменить решением с причиной.",
        created_at: now.toISOString(),
      });
    } else {
      const flagged = (await store.t.council_journal.list({ kind: "probation_ready", member_id: m.id })).length > 0;
      if (flagged) continue;
      ready.push(m);
      await store.t.council_journal.insert({ kind: "probation_ready", member_id: m.id, ref_id: null, note: "Испытательный месяц закончился, помощь есть — можно посвящать.", created_at: now.toISOString() });
    }
  }
  return { exited, ready };
}

/** Совет отменяет авто-выход решением с причиной: испытательный месяц начинается заново. */
export async function keepProbation(
  store: Store,
  now: Date,
  input: { by: Id; member_id: Id; reason: string },
): Promise<{ member: Member; decision: CouncilDecision }> {
  const cfg = await store.getConfig();
  await assertStaff(store, now, input.by);
  const m = await requireMember(store, input.member_id);
  if (m.status !== "left" || m.left_reason !== "probation_empty") throw new DomainError("not_exited", "Отменить можно только выход по пустому испытательному месяцу.");
  const decision = await recordDecision(store, now, { kind: "probation_override", subject_id: m.id, by: input.by, reason: input.reason });
  const member = await store.t.members.update(m.id, {
    status: "probation",
    left_at: null,
    left_reason: null,
    probation_until: addMonths(now, cfg.probation_months).toISOString(),
  });
  return { member, decision };
}

export async function setFirstHelpStatus(
  store: Store,
  now: Date,
  input: { by: Id; member_id: Id; status: Exclude<FirstHelpStatus, "pending"> },
): Promise<FirstHelp> {
  await assertStaff(store, now, input.by);
  const fh = (await store.t.first_help.list({ member_id: input.member_id }))[0];
  if (!fh) throw new DomainError("not_found", "У этого человека нет записи о первой помощи.");
  return store.t.first_help.update(fh.id, { status: input.status, helped_at: input.status === "helped" ? now.toISOString() : fh.helped_at });
}

/**
 * Выход из клуба. Личные поля удаляются; записи о помощи остаются, подпись — «бывший участник»,
 * поэтому Пульс других не ломается. TODO(legal): сроки хранения и что считать персональными данными в отзывах.
 */
export async function leaveClub(store: Store, now: Date, memberId: Id, reason = "left"): Promise<Member> {
  const m = await requireMember(store, memberId);
  if (m.status === "left" || m.status === "expelled") return m;
  const tg = m.tg_user_id;

  for (const r of await store.t.requests.list({ author_id: m.id, status: "active" })) {
    await store.t.requests.update(r.id, { status: "canceled", closed_at: now.toISOString() });
  }
  for (const o of await store.t.offers.list({ author_id: m.id, is_active: true })) await store.t.offers.update(o.id, { is_active: false });
  for (const r of await store.t.meeting_requests.list()) {
    if ((r.from_id === m.id || r.to_id === m.id) && (r.status === "pending" || r.status === "postponed")) {
      await store.t.meeting_requests.update(r.id, { status: "canceled" });
      if (r.uses_credit) await releaseCredit(store, now, r.from_id, r.id);
    }
  }
  for (const fh of await store.t.first_help.list({ member_id: m.id })) await store.t.first_help.update(fh.id, { main_request: "" });
  for (const a of await store.t.applications.list({ member_id: m.id })) {
    await store.t.applications.update(a.id, { answers: a.answers.map(() => ""), short_flags: a.short_flags.map(() => false), call_notes: null, main_request: null });
  }
  if (tg != null) {
    await store.t.bot_sessions.remove(String(tg));
    for (const g of await store.t.guests.list({ tg_user_id: tg })) await store.t.guests.remove(g.id);
  }

  return store.t.members.update(m.id, {
    status: "left",
    left_at: now.toISOString(),
    left_reason: reason,
    name: null,
    niche: null,
    skills: [],
    tg_user_id: null,
    tg_username: null,
    paused_until: null,
    consent_at: null,
  });
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { chooseResponders, createOffer, createRequest, cancelRequest, deactivateOffer, respondToRequest } from "@core/board";
import { advanceClock, resetClock } from "@core/clock";
import { startTerm } from "@core/council";
import { recordPing } from "@core/duty";
import { confirmHelp } from "@core/helps";
import { admit, admitDirect, keepProbation, leaveClub, setFirstHelpStatus, signLaws } from "@core/lifecycle";
import { assignDuty } from "@core/duty";
import { findMemberByRef } from "@core/members";
import { cancelMeetingRequest, declineMeetingRequest, pressMet, requestMeeting, startMeeting } from "@core/meetings";
import { acceptCandidate, attachSponsor, chooseUsefulTask, createEvent, getApplication, markAttendance, markGuest, recordCall, rejectCandidate, reviewAnswer, saveAnswer, startCandidate, submitApplication } from "@core/selection";
import { addDays, startOfWeek, zonedToUtc } from "@core/time";
import { tick } from "@core/tick";
import { ConstraintError, DomainError, type Member } from "@core/types";
import { flushStore, getViewer, resetStore, SESSION_COOKIE, type Viewer } from "@/server/club";
import type { ActionState } from "@/components/forms/ActionForm";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type Outcome = void | string | { to: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const flag = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "yes";
const all = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

function friendly(e: unknown): string | null {
  if (e instanceof DomainError) return e.message;
  if (e instanceof ConstraintError) return "Так нельзя: это противоречит правилам клуба.";
  return null;
}

/** Общая часть: перехват ошибок правил клуба, запись данных, обновление экранов, переход. */
async function execute(store: Parameters<typeof flushStore>[0], run: () => Promise<Outcome>): Promise<ActionState> {
  let out: Outcome;
  try {
    out = await run();
  } catch (e) {
    await flushStore(store);
    const msg = friendly(e);
    if (msg) return { error: msg };
    throw e;
  }
  await flushStore(store); // в облачном хранилище изменения уходят сюда, до перехода на другую страницу
  revalidatePath("/", "layout");
  if (out && typeof out === "object") redirect(out.to);
  return typeof out === "string" ? { ok: out } : { ok: "Готово." };
}

/** Действие для участников клуба (или только для создателя и Совета). Проверка «кто ты» — на сервере, каждый раз. */
function make(need: "member" | "staff", fn: (v: Viewer & { member: Member }, fd: FormData) => Promise<Outcome>): FormAction {
  return async (_prev, fd) => {
    const v = await getViewer();
    if (!v.member || !v.inside) return { error: "Это доступно участникам клуба." };
    if (need === "staff" && !v.staff) return { error: "Это доступно создателю и Совету." };
    return execute(v.store, () => fn(v as Viewer & { member: Member }, fd));
  };
}

/** Действие для любого посетителя (вход кандидата, тестовая панель). */
function makeAny(fn: (v: Viewer, fd: FormData) => Promise<Outcome>): FormAction {
  return async (_prev, fd) => {
    const v = await getViewer();
    return execute(v.store, () => fn(v, fd));
  };
}

// ───── тестовая панель ─────

export const switchPersonaAction: FormAction = makeAny(async (_v, fd) => {
  const tg = Number(str(fd, "tg"));
  if (!Number.isFinite(tg) || tg <= 0) throw new DomainError("bad_tg", "Не понял, кого выбрать.");
  (await cookies()).set(SESSION_COOKIE, String(tg), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return { to: "/" };
});

export const advanceTimeAction: FormAction = makeAny(async (v, fd) => {
  const d = Number(str(fd, "days"));
  if (!Number.isFinite(d) || d <= 0 || d > 400) throw new DomainError("bad_days", "Сколько дней? От 1 до 400.");
  const now = advanceClock(v.store, d * 86_400_000);
  const r = await tick(v.store, now);
  return { to: `/dev?moved=${d}&created=${r.created}` };
});

export const resetClockAction: FormAction = makeAny(async (v) => {
  resetClock(v.store);
  return { to: "/dev" };
});

export const runTickAction: FormAction = makeAny(async (v) => {
  const r = await tick(v.store, v.now);
  return { to: `/dev?created=${r.created}` };
});

export const resetDataAction: FormAction = makeAny(async () => {
  await resetStore();
  (await cookies()).delete(SESSION_COOKIE);
  return { to: "/dev?reset=1" };
});

// ───── доска ─────

export const createRequestAction: FormAction = make("member", async (v, fd) => {
  const days = Number(str(fd, "days")) || 7;
  const sensitive = flag(fd, "sensitive");
  await createRequest(v.store, v.now, {
    author_id: v.member.id,
    text: str(fd, "text"),
    sphere_id: str(fd, "sphere"),
    deadline: addDays(v.now, days).toISOString(),
    is_urgent: flag(fd, "urgent"),
    is_sensitive: sensitive,
    visible_to: sensitive ? all(fd, "visible_to") : [],
  });
  return { to: "/board/active" };
});

export const cancelRequestAction: FormAction = make("member", async (v, fd) => {
  await cancelRequest(v.store, v.now, str(fd, "id"), v.member.id);
  return { to: "/board" };
});

export const respondAction: FormAction = make("member", async (v, fd) => {
  await respondToRequest(v.store, v.now, {
    request_id: str(fd, "request_id"),
    responder_id: v.member.id,
    message: str(fd, "message"),
    mode: str(fd, "mode") as "help" | "order",
  });
  return { to: "/board/help?sent=1" };
});

export const chooseAction: FormAction = make("member", async (v, fd) => {
  const requestId = str(fd, "request_id");
  const responseId = str(fd, "response_id");
  await chooseResponders(v.store, v.now, requestId, v.member.id, [responseId]);
  const resp = await v.store.t.responses.get(responseId);
  return { to: `/board/connected?request=${requestId}&helper=${resp?.responder_id ?? ""}` };
});

export const confirmHelpAction: FormAction = make("member", async (v, fd) => {
  const res = await confirmHelp(v.store, v.now, {
    actor_id: v.member.id,
    receiver_id: v.member.id,
    helper_id: str(fd, "helper_id"),
    sphere_id: str(fd, "sphere"),
    grade: Number(str(fd, "grade")),
    review: str(fd, "review"),
    request_id: str(fd, "request_id") || null,
  });
  return { to: `/board?confirmed=${res.help.helper_id}&credit=${res.credit_granted ? 1 : 0}` };
});

export const createOfferAction: FormAction = make("member", async (v, fd) => {
  await createOffer(v.store, v.now, { author_id: v.member.id, text: str(fd, "text"), sphere_id: str(fd, "sphere") });
  return { to: "/board/help" };
});

export const deactivateOfferAction: FormAction = make("member", async (v, fd) => {
  await deactivateOffer(v.store, str(fd, "id"), v.member.id);
  return { to: "/board/help" };
});

// ───── встречи ─────

export const requestMeetingAction: FormAction = make("member", async (v, fd) => {
  const res = await requestMeeting(v.store, v.now, {
    from_id: v.member.id,
    to_id: str(fd, "to_id"),
    uses_credit: str(fd, "credit") === "yes",
    purpose: str(fd, "purpose"),
  });
  return { to: `/meet?sent=1${res.first_meeting_notice ? "&first=1" : ""}${res.postponed ? "&postponed=1" : ""}` };
});

export const pressMetAction: FormAction = make("member", async (v, fd) => {
  const res = await pressMet(v.store, v.now, { request_id: str(fd, "request_id") || undefined, meeting_id: str(fd, "meeting_id") || undefined, member_id: v.member.id });
  return { to: `/meet?${res.completed ? "met=1" : "pressed=1"}` };
});

export const cancelMeetingAction: FormAction = make("member", async (v, fd) => {
  await cancelMeetingRequest(v.store, v.now, str(fd, "id"), v.member.id);
  return { to: "/meet" };
});

export const declineMeetingAction: FormAction = make("member", async (v, fd) => {
  await declineMeetingRequest(v.store, v.now, str(fd, "id"), v.member.id);
  return { to: "/meet" };
});

export const startMeetingAction: FormAction = make("member", async (v, fd) => {
  const res = await startMeeting(v.store, v.now, v.member.id, str(fd, "other_id"));
  return { to: `/meet?${res.completed ? "met=1" : "pressed=1"}${res.first_meeting_notice ? "&first=1" : ""}` };
});

// ───── профиль и входящие ─────

export const leaveClubAction: FormAction = make("member", async (v, fd) => {
  if (str(fd, "confirm").toLowerCase() !== "выйти") throw new DomainError("confirm", "Чтобы выйти, напиши слово «выйти».");
  await leaveClub(v.store, v.now, v.member.id);
  return { to: "/join" };
});

export const markReadAction: FormAction = make("member", async (v) => {
  for (const n of await v.store.t.notifications.list({ member_id: v.member.id })) {
    if (!n.read_at) await v.store.t.notifications.update(n.id, { read_at: v.now.toISOString() });
  }
});

// ───── вход кандидата ─────

export const joinAction: FormAction = makeAny(async (v, fd) => {
  if (!flag(fd, "consent")) throw new DomainError("consent", "Нужно согласие на хранение анкеты. TODO(legal): финальный текст согласия.");
  const sponsorRef = str(fd, "sponsor");
  const sponsor = sponsorRef ? await findMemberByRef(v.store, sponsorRef) : undefined;
  if (sponsorRef && !sponsor) throw new DomainError("no_sponsor", "Не нашёл поручителя с таким номером. Оставь поле пустым, если пришёл сам.");
  const res = await startCandidate(v.store, v.now, { tg_user_id: v.tg, tg_username: v.username, name: v.displayName, codeword: str(fd, "codeword"), sponsor_id: sponsor?.id });
  if (!res.ok) {
    const msg: Record<string, string> = {
      bad_codeword: "Это не то слово. Кодовое слово даёт участник клуба.",
      not_guest: "Анкета открывается тем, кто был гостем на открытом событии клуба. Приходи на ближайшее — дату можно узнать у участника, который тебя пригласил.",
      already_member: "Ты уже в клубе.",
      rejected: "Твоя заявка уже рассмотрена.",
    };
    throw new DomainError(res.reason, msg[res.reason]);
  }
  if (!res.member.consent_at) await v.store.t.members.update(res.member.id, { consent_at: v.now.toISOString() });
  return { to: res.sponsor_error ? `/join?sponsor_error=${encodeURIComponent(res.sponsor_error)}` : "/join" };
});

export const saveApplicationAction: FormAction = makeAny(async (v, fd) => {
  const app = v.member ? await getApplication(v.store, v.member.id) : undefined;
  if (!app) throw new DomainError("no_application", "Сначала открой анкету кодовым словом.");
  for (let q = 1; q <= 8; q++) {
    const text = str(fd, `a${q}`);
    if (text) await saveAnswer(v.store, v.now, app.id, q, text);
  }
  if (str(fd, "intent") === "submit") {
    await submitApplication(v.store, v.now, app.id);
    return { to: "/join" };
  }
  return "Черновик сохранён.";
});

export const chooseTaskAction: FormAction = makeAny(async (v, fd) => {
  const app = v.member ? await getApplication(v.store, v.member.id) : undefined;
  if (!app) throw new DomainError("no_application", "Нет анкеты.");
  await chooseUsefulTask(v.store, v.now, app.id, str(fd, "task_id"));
  return { to: "/join" };
});

export const reviewAction: FormAction = make("member", async (v, fd) => {
  const applicationId = str(fd, "application_id");
  let n = 0;
  for (let q = 1; q <= 8; q++) {
    const verdict = str(fd, `v${q}`);
    if (verdict === "ok" || verdict === "refuse") {
      await reviewAnswer(v.store, v.now, { application_id: applicationId, reviewer_id: v.member.id, question_no: q, verdict });
      n++;
    }
  }
  if (n === 0) throw new DomainError("empty", "Отметь хотя бы один ответ: «ок» или «отказ».");
  return { to: "/review" };
});

export const dutyPingAction: FormAction = make("member", async (v, fd) => {
  const first = str(fd, "p1");
  const second = str(fd, "p2");
  if (!first || !second || first === second) throw new DomainError("two", "Выбери двух разных людей, которым написал(а) лично.");
  const requestId = str(fd, "request_id");
  await recordPing(v.store, v.now, { request_id: requestId, duty_id: v.member.id, pinged_id: first });
  await recordPing(v.store, v.now, { request_id: requestId, duty_id: v.member.id, pinged_id: second });
  return { to: "/duty?done=1" };
});

// ───── штаб (создатель и Совет) ─────

/** Время из поля datetime-local считаем по Берлину. */
function berlin(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) throw new DomainError("bad_date", "Не понял дату. Нужен вид 2026-10-18 17:00.");
  return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 18), Number(m[5] ?? 0));
}

async function memberByRef(v: Viewer, ref: string): Promise<Member> {
  const m = await findMemberByRef(v.store, ref);
  if (!m) throw new DomainError("not_found", `Не нашёл «${ref}». Нужен номер, @ник или Telegram id.`);
  return m;
}

export const createEventAction: FormAction = make("staff", async (v, fd) => {
  await createEvent(v.store, v.now, { by: v.member.id, title: str(fd, "title"), starts_at: berlin(str(fd, "starts_at")).toISOString(), is_open: flag(fd, "open") });
  return "Событие создано.";
});

export const markGuestAction: FormAction = make("staff", async (v, fd) => {
  const who = str(fd, "who");
  if (!who) throw new DomainError("who", "Укажи @ник или Telegram id гостя.");
  const isId = /^\d{5,}$/.test(who);
  await markGuest(v.store, v.now, { by: v.member.id, event_id: str(fd, "event_id"), ...(isId ? { tg_user_id: Number(who) } : { tg_username: who }) });
  return "Гость отмечен.";
});

export const attendAction: FormAction = make("staff", async (v, fd) => {
  const ids = all(fd, "member_ids");
  if (ids.length === 0) throw new DomainError("who", "Отметь хотя бы одного участника.");
  for (const id of ids) await markAttendance(v.store, v.now, { by: v.member.id, event_id: str(fd, "event_id"), member_id: id });
  return `Явка отмечена: ${ids.length}.`;
});

export const recordCallAction: FormAction = make("staff", async (v, fd) => {
  await recordCall(v.store, v.now, { by: v.member.id, application_id: str(fd, "application_id"), notes: str(fd, "notes"), main_request: String(fd.get("main_request") ?? "") });
  return "Звонок записан. Главный запрос сохранён дословно.";
});

export const acceptAction: FormAction = make("staff", async (v, fd) => {
  await acceptCandidate(v.store, v.now, { by: v.member.id, member_id: str(fd, "member_id"), reason: str(fd, "reason") });
  return "Принят на испытательный месяц. Решение записано.";
});

export const rejectAction: FormAction = make("staff", async (v, fd) => {
  await rejectCandidate(v.store, v.now, { by: v.member.id, member_id: str(fd, "member_id"), reason: str(fd, "reason") });
  return "Отказ записан.";
});

export const admitAction: FormAction = make("staff", async (v, fd) => {
  const res = await admit(v.store, v.now, { by: v.member.id, member_id: str(fd, "member_id"), reason: str(fd, "reason") || undefined });
  return `Посвящён(а): №${res.member.number}${res.member.is_founder ? " · Основатель" : ""}.`;
});

export const admitDirectAction: FormAction = make("staff", async (v, fd) => {
  const who = str(fd, "who");
  if (!who) throw new DomainError("who", "Укажи @ник или Telegram id.");
  const isId = /^\d{5,}$/.test(who);
  const m = await admitDirect(v.store, v.now, { by: v.member.id, name: str(fd, "name"), reason: str(fd, "reason") || undefined, ...(isId ? { tg_user_id: Number(who) } : { tg_username: who }) });
  return `Добавлен(а): №${m.number}.`;
});

export const signLawsAction: FormAction = make("staff", async (v, fd) => {
  const m = await memberByRef(v, str(fd, "ref"));
  await signLaws(v.store, v.now, { by: v.member.id, member_id: m.id });
  return "Подпись законов отмечена.";
});

export const keepAction: FormAction = make("staff", async (v, fd) => {
  await keepProbation(v.store, v.now, { by: v.member.id, member_id: str(fd, "member_id"), reason: str(fd, "reason") });
  return "Выход отменён решением Совета. Испытательный месяц начался заново.";
});

export const firstHelpAction: FormAction = make("staff", async (v, fd) => {
  const m = await memberByRef(v, str(fd, "ref"));
  await setFirstHelpStatus(v.store, v.now, { by: v.member.id, member_id: m.id, status: str(fd, "status") as "talked" | "helped" | "no_solution_told" });
  return "Статус первой помощи обновлён.";
});

export const assignDutyAction: FormAction = make("staff", async (v, fd) => {
  const m = await memberByRef(v, str(fd, "ref"));
  await assignDuty(v.store, v.now, m.id);
  return "Дежурный на эту неделю назначен.";
});

export const hoursAction: FormAction = make("staff", async (v, fd) => {
  const hours = Number(str(fd, "hours").replace(",", "."));
  if (!Number.isFinite(hours) || hours < 0 || hours > 100) throw new DomainError("bad_hours", "Часы: число от 0 до 100.");
  const week = startOfWeek(str(fd, "week") ? berlin(str(fd, "week")) : v.now).toISOString();
  const existing = (await v.store.t.creator_hours.list({ week_start: week }))[0];
  if (existing) await v.store.t.creator_hours.update(existing.id, { hours });
  else await v.store.t.creator_hours.insert({ week_start: week, hours, created_at: v.now.toISOString() });
  return "Часы за неделю записаны.";
});

export const startTermAction: FormAction = make("staff", async (v, fd) => {
  const m = await memberByRef(v, str(fd, "ref"));
  await startTerm(v.store, v.now, m.id, v.now);
  return "Срок в Совете начат.";
});

export const attachSponsorAction: FormAction = make("staff", async (v, fd) => {
  const cand = await memberByRef(v, str(fd, "candidate"));
  const sponsor = await memberByRef(v, str(fd, "sponsor"));
  await attachSponsor(v.store, v.now, cand.id, sponsor.id);
  return "Поручитель закреплён.";
});

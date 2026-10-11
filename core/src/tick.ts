/**
 * Плановые задачи (decisions D4): вызывается регулярно (раз в минуту), каждая задача идемпотентна.
 * Результат — записи в `notifications`: приложение показывает их во «Входящих», бот отправит в Telegram.
 * Повторов нет: каждое сообщение помечается ключом в `sent_notifications`.
 */
import { isCouncilMember } from "./access";
import { expireRequests } from "./board";
import { termsEndingSoon, sweepEndedTerms } from "./council";
import { currentDuty, hungRequests } from "./duty";
import { probationSweep } from "./lifecycle";
import { memberLabel } from "./members";
import { sweepMeetingRequests } from "./meetings";
import { applyStopRule, takeMonthlySnapshot } from "./pulse_service";
import type { Store } from "./store/store";
import { monthKey, prevMonthKey, startOfWeek } from "./time";
import type { Id } from "./types";

const DAY = 86_400_000;

export interface TickResult {
  /** Какие плановые задачи выполнились именно в этот вызов (для месячных). */
  jobs: string[];
  /** Сколько новых сообщений создано. */
  created: number;
}

class Notifier {
  created = 0;
  constructor(
    private store: Store,
    private now: Date,
  ) {}

  /** Создать сообщение. Если указан `key` и такое уже отправляли — ничего не делает. */
  async send(key: string | null, memberId: Id, kind: string, text: string, link: string | null = null): Promise<boolean> {
    if (key) {
      if ((await this.store.t.sent_notifications.list({ key })).length > 0) return false;
      await this.store.t.sent_notifications.insert({ key, created_at: this.now.toISOString() });
    }
    await this.store.t.notifications.insert({ member_id: memberId, kind, text, link, created_at: this.now.toISOString(), read_at: null });
    this.created++;
    return true;
  }
}

async function staffIds(store: Store, now: Date): Promise<Id[]> {
  const out: Id[] = [];
  for (const m of await store.t.members.list()) {
    if (m.status === "left" || m.status === "expelled") continue;
    if (m.is_creator || (await isCouncilMember(store, m.id, now))) out.push(m.id);
  }
  return out;
}

export async function tick(store: Store, now: Date): Promise<TickResult> {
  const cfg = await store.getConfig();
  const n = new Notifier(store, now);
  const jobs: string[] = [];
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const label = (id: Id | null) => memberLabel(id ? members.get(id) : undefined);
  const staff = await staffIds(store, now);

  // ── встречи ──
  const sw = await sweepMeetingRequests(store, now);
  for (const r of sw.activated) {
    await n.send(`mr:${r.id}:activated`, r.to_id, "meeting_activated", `С тобой хочет встретиться ${label(r.from_id)}. Срок — до ${fmtDate(r.deadline)}, минимум 30 минут, живьём или по видео.`, "/meet");
  }
  for (const r of sw.missed) {
    await n.send(`mr:${r.id}:missed:from`, r.from_id, "meeting_missed", `Встреча с ${label(r.to_id)} не состоялась к сроку. Кредит вернулся к тебе.`, "/meet");
    await n.send(`mr:${r.id}:missed:to`, r.to_id, "meeting_missed", `Ты не встретился с ${label(r.from_id)} к сроку. Пропуск записан для Совета.`, "/meet");
  }
  for (const r of sw.expired) {
    await n.send(`mr:${r.id}:expired`, r.from_id, "meeting_expired", `${label(r.to_id)} не ответил на запрос о встрече. Без кредита это не обязательно, ничего не потеряно.`, "/meet");
  }
  for (const r of await store.t.meeting_requests.list({ status: "pending", uses_credit: true })) {
    const left = Date.parse(r.deadline) - now.getTime();
    if (left <= 0) continue;
    for (const d of cfg.meeting_reminder_days_before) {
      if (left <= d * DAY) await n.send(`mr:${r.id}:d${d}`, r.to_id, "meeting_reminder", `Встреча с ${label(r.from_id)}: срок — до ${fmtDate(r.deadline)}. Договоритесь о времени и нажмите «Встретились», когда она пройдёт.`, "/meet");
    }
    if (left <= DAY) await n.send(`mr:${r.id}:due`, r.to_id, "meeting_reminder", `Сегодня последний день для встречи с ${label(r.from_id)}.`, "/meet");
  }

  // ── доска ──
  for (const r of await expireRequests(store, now)) {
    await n.send(`req:${r.id}:expired`, r.author_id, "request_expired", "Срок твоей записки на доске прошёл, она закрыта. Нужна помощь по-прежнему — оставь новую.", "/board");
  }
  const hung = await hungRequests(store, now);
  if (hung.length > 0) {
    const week = startOfWeek(now).toISOString();
    const duty = await currentDuty(store, now);
    if (!duty) {
      for (const id of staff.filter((s) => members.get(s)?.is_creator)) {
        await n.send(`dutymissing:${week}`, id, "duty_missing", "На доске есть запросы без откликов, а дежурный на эту неделю не назначен. Назначь дежурного.", "/dev");
      }
    } else {
      for (const r of hung) {
        await n.send(`duty:${r.id}:${week}`, duty.id, "duty_hung", `Запрос ${label(r.author_id)} висит больше ${cfg.duty_after_hours} часов без откликов. Напиши лично двум людям, кто может помочь, и отметь их.`, `/duty?request=${r.id}`);
      }
    }
  }

  // ── первая помощь ──
  for (const fh of await store.t.first_help.list({ status: "pending" })) {
    if (!fh.talk_deadline) continue;
    const m = members.get(fh.member_id);
    if (!m || m.status === "left" || m.status === "expelled") continue;
    const left = Date.parse(fh.talk_deadline) - now.getTime();
    const recipients = [...new Set([fh.member_id, fh.sponsor_id, ...staff.filter((s) => members.get(s)?.is_creator)].filter(Boolean) as Id[])];
    if (left > 0 && left <= 3 * DAY) {
      for (const id of recipients) {
        await n.send(`fh:${fh.id}:soon:${id}`, id, "first_help_soon", id === fh.member_id ? `Через ${Math.max(1, Math.ceil(left / DAY))} дн. срок первой помощи: ты поговоришь с человеком, который ближе всего к твоей задаче.` : `У ${label(fh.member_id)} подходит срок первой помощи (14 дней). Разговор с нужным человеком ещё не отмечен.`, "/study");
      }
    } else if (left <= 0) {
      if (await n.send(`fh:${fh.id}:overdue:${fh.member_id}`, fh.member_id, "first_help_overdue", "Срок первой помощи вышел. Создатель уже в курсе и поможет, пока мы не сказали прямо: «решения нет» — и не дали то, что есть.", "/study")) {
        await store.t.council_journal.insert({ kind: "first_help_overdue", member_id: fh.member_id, ref_id: fh.id, note: "Срок первой помощи (14 дней) вышел.", created_at: now.toISOString() });
      }
      for (const id of recipients.filter((x) => x !== fh.member_id)) {
        await n.send(`fh:${fh.id}:overdue:${id}`, id, "first_help_overdue", `Срок первой помощи для ${label(fh.member_id)} вышел. Нужно действовать.`, "/study");
      }
    }
  }

  // ── испытательный месяц ──
  const ps = await probationSweep(store, now);
  for (const m of ps.exited) {
    await n.send(`probation:${m.id}:exit`, m.id, "probation_exit", "Испытательный месяц закончился без подтверждённой помощи — по правилам клуба это выход. Совет может отменить решение с причиной.", null);
    for (const id of staff) await n.send(`probation:${m.id}:exit:${id}`, id, "probation_exit", `${label(m.id)}: испытательный месяц без помощи, выход по умолчанию. Отменить можно только решением с причиной.`, "/dev");
  }
  for (const m of ps.ready) {
    for (const id of staff) await n.send(`probation:${m.id}:ready:${id}`, id, "probation_ready", `${label(m.id)} прошёл(ла) испытательный месяц с подтверждённой помощью — можно посвящать и выдавать номер.`, "/dev");
  }

  // ── Совет ──
  for (const t of await termsEndingSoon(store, now)) {
    const text = `Срок члена Совета (${label(t.member_id)}) заканчивается ${fmtDate(t.ends_on)}. Не больше двух сроков подряд.`;
    for (const id of new Set([t.member_id, ...staff.filter((s) => members.get(s)?.is_creator)])) await n.send(`term:${t.id}:warn:${id}`, id, "council_term_ending", text, null);
  }
  await sweepEndedTerms(store, now);

  // ── месячные задачи: снимок Пульса и правило «< 20 два месяца подряд» ──
  const prev = prevMonthKey(monthKey(now));
  if ((await store.t.sent_notifications.list({ key: `job:monthly:${prev}` })).length === 0) {
    await store.t.sent_notifications.insert({ key: `job:monthly:${prev}`, created_at: now.toISOString() });
    await takeMonthlySnapshot(store, now);
    for (const m of await applyStopRule(store, now)) {
      for (const id of staff) await n.send(`stopped:${m.id}:${prev}:${id}`, id, "stopped_talk", `${label(m.id)}: Пульс ниже ${cfg.pulse_stop_threshold} уже ${cfg.pulse_stop_months} месяца подряд. Нужен разговор. Это не исключение.`, "/dev");
    }
    jobs.push(`monthly:${prev}`);
  }

  return { jobs, created: n.created };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);
}

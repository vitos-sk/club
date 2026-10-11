import { canSeeRequest, getPulseFor } from "@core/access";
import { creditBalance } from "@core/credits";
import { currentDuty, hungRequests } from "@core/duty";
import { memberLabel } from "@core/members";
import { KeyCard } from "@/components/club/KeyCard";
import { Plaque } from "@/components/club/Plaque";
import { RoomCard } from "@/components/club/RoomCard";
import { TaskRow } from "@/components/club/TaskRow";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { IconName } from "@/components/ui/Icon";
import { daysLeft, fmtDay, plural, STATUS_LABEL } from "@/lib/format";
import { requireInside } from "@/server/club";

interface Task {
  title: string;
  sub: string;
  href: string;
  cta: string;
  done: boolean;
}

/** Холл — главный экран */
export default async function HallPage() {
  const v = await requireInside();
  const { store, now, member } = v;
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const pulse = member.status === "probation" ? null : (await getPulseFor(store, now, member.id, member.id)).value;

  // ── «У стойки»: что сейчас стоит сделать ──
  const tasks: Task[] = [];
  const incoming = (await store.t.meeting_requests.list({ to_id: member.id })).filter((r) => r.status === "pending");
  for (const r of incoming) {
    tasks.push({
      title: r.uses_credit ? "Ответить на запрос встречи" : "Тебя просят о встрече",
      sub: `${memberLabel(members.get(r.from_id))} · осталось ${daysLeft(r.deadline, now)} дн.`,
      href: "/meet",
      cta: "Идти",
      done: false,
    });
  }
  const fh = (await store.t.first_help.list({ member_id: member.id })).find((f) => f.status === "pending");
  if (fh) {
    tasks.push({ title: "Первая помощь: твой главный запрос", sub: fh.talk_deadline ? `поговорить с нужным человеком до ${fmtDay(fh.talk_deadline)}` : "срок появится после приёма", href: "/study", cta: "Открыть", done: false });
  }
  if (member.status === "probation") {
    const gave = (await store.t.helps.list({ helper_id: member.id })).filter((h) => Date.parse(h.confirmed_at) >= Date.parse(member.joined_at ?? now.toISOString())).length;
    tasks.push({
      title: "Помочь хотя бы одному участнику",
      sub: gave > 0 ? "Помощь подтверждена — можно посвящаться" : `нужна подтверждённая помощь до ${member.probation_until ? fmtDay(member.probation_until) : "конца месяца"}`,
      href: "/board/help",
      cta: "На доску",
      done: gave > 0,
    });
  }
  const myRequest = (await store.t.requests.list({ author_id: member.id, status: "active" }))[0];
  tasks.push(
    myRequest
      ? { title: "Твоя записка на доске", sub: "", href: "/board/active", cta: "Открыть", done: true }
      : { title: "Попросить о помощи", sub: "Прикрепи записку: что тебе нужно", href: "/board", cta: "Идти", done: false },
  );
  const duty = await currentDuty(store, now);
  if (duty?.id === member.id) {
    const hung = await hungRequests(store, now);
    if (hung.length > 0) tasks.push({ title: "Ты дежурный: запросы без откликов", sub: `${hung.length} ${plural(hung.length, "запрос ждёт", "запроса ждут", "запросов ждут")}`, href: "/duty", cta: "Идти", done: false });
  }
  const notes = await store.t.notifications.list({ member_id: member.id });
  const unread = notes.filter((n) => !n.read_at).length;
  if (unread > 0) tasks.push({ title: "Новые сообщения", sub: `${unread} во «Входящих»`, href: "/inbox", cta: "Читать", done: false });

  const done = tasks.filter((t) => t.done).length;
  const credits = await creditBalance(store, member.id);
  const board = (await store.t.requests.list({ status: "active" })).filter((r) => canSeeRequest(r, member.id, v.staff)).length;
  const nextEvent = (await store.t.events.list()).filter((e) => Date.parse(e.starts_at) > now.getTime()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const people = (await store.t.members.list()).filter((m) => m.status === "member" || m.status === "partner" || m.status === "council").length;

  const rooms: Array<{ href: string; icon: IconName; title: string; live: string; alert?: boolean; locked?: boolean }> = [
    { href: "/board", icon: "board", title: "Доска запросов", live: `${board} ${plural(board, "записка", "записки", "записок")}` },
    { href: "/inbox", icon: "telegram", title: "Входящие", live: unread ? `${unread} новых` : "новых нет", alert: unread > 0 },
    { href: "/meet", icon: "cal", title: "Зал встреч", live: `кредитов: ${credits.available}`, alert: incoming.length > 0 },
    { href: "/people", icon: "users", title: "Люди клуба", live: `${people} участников` },
    { href: "/fireplace", icon: "fire", title: "Каминная", live: nextEvent ? `${fmtDay(nextEvent.starts_at)} · ${nextEvent.title}` : "событий пока нет" },
    v.staff ? { href: "/council", icon: "scale", title: "Совет", live: "открыто" } : { href: "/council", icon: "scale", title: "Совет", live: "для Партнёров", locked: true },
  ];

  return (
    <>
      <Plaque />
      <div className="mt-7">
        <KeyCard number={member.number} name={member.name ?? "бывший участник"} role={member.is_founder ? "Основатель" : STATUS_LABEL[member.status]} level={STATUS_LABEL[member.status]} pulse={pulse} />
      </div>

      <SectionTitle aside={`${done} из ${tasks.length}`}>У стойки</SectionTitle>
      <div>
        {tasks.map((t) => (
          <TaskRow key={t.title + t.href} title={t.title} sub={t.sub} href={t.href} cta={t.cta} done={t.done} />
        ))}
      </div>

      <SectionTitle>Комнаты клуба</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {rooms.map((r) => (
          <RoomCard key={r.title} {...r} />
        ))}
      </div>
    </>
  );
}

import { creditBalance } from "@core/credits";
import { memberLabel } from "@core/members";
import { monthKey } from "@core/time";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { Bar } from "@/components/ui/Bar";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/Field";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { daysLeft, fmtDay, fmtDayTime } from "@/lib/format";
import { cancelMeetingAction, declineMeetingAction, pressMetAction, startMeetingAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Зал встреч: кредиты, запросы встреч, отметка «встретились», ближайшие события */
export default async function MeetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const { store, now, member } = v;
  const cfg = await store.getConfig();
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const credits = await creditBalance(store, member.id);
  const allRequests = await store.t.meeting_requests.list();
  const meetings = await store.t.meetings.list();
  const mk = monthKey(now);

  const obligations = allRequests.filter((r) => r.to_id === member.id && r.uses_credit && r.counted_month === mk && r.status !== "canceled").length;
  const incoming = allRequests.filter((r) => r.to_id === member.id && (r.status === "pending" || r.status === "postponed"));
  const outgoing = allRequests.filter((r) => r.from_id === member.id && (r.status === "pending" || r.status === "postponed"));
  const waitingMe = meetings.filter((m) => m.request_id === null && !(m.a_confirmed && m.b_confirmed) && ((m.a_id === member.id && !m.a_confirmed) || (m.b_id === member.id && !m.b_confirmed)));
  const done = meetings.filter((m) => m.a_confirmed && m.b_confirmed && (m.a_id === member.id || m.b_id === member.id)).sort((a, b) => Date.parse(b.met_at!) - Date.parse(a.met_at!)).slice(0, 5);
  const others = [...members.values()].filter((m) => m.id !== member.id && ["probation", "member", "partner", "council"].includes(m.status));
  const events = (await store.t.events.list()).filter((e) => Date.parse(e.starts_at) > now.getTime()).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  const pressedBy = (requestId: string | null, meetingId: string | null) => {
    const m = meetings.find((x) => x.id === meetingId || (requestId && x.request_id === requestId));
    if (!m) return { me: false, other: false };
    const meIsA = m.a_id === member.id;
    return { me: meIsA ? m.a_confirmed : m.b_confirmed, other: meIsA ? m.b_confirmed : m.a_confirmed };
  };

  return (
    <>
      <BackLink />
      <PageHeader title="Зал встреч" lead="Новая связь каждый месяц. Встреча засчитывается, когда вы оба нажали «Встретились»." />

      {sp.first && <p className="mb-5 rounded-xl border border-info/50 bg-info/10 px-4 py-3 text-[14px] font-semibold leading-snug text-info">Первая встреча пары — в публичном месте или онлайн. Это правило безопасности клуба.</p>}
      {sp.sent && <p role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Запрос отправлен.{sp.postponed ? " У этого человека уже 2 обязательные встречи в месяце, поэтому твоя перенесена на следующий месяц. Кредит зарезервирован." : ""}</p>}
      {sp.met && <p role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Встреча засчитана: нажали обе стороны.</p>}
      {sp.pressed && <p role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Твоя отметка принята. Ждём вторую сторону.</p>}

      <Card>
        <Eyebrow>Твои кредиты на встречи</Eyebrow>
        <Bar label="Доступно (всего не больше 4)" value={credits.unspent} max={cfg.credits_max} />
        <p className="text-[13px] leading-snug text-mute">Свободно: {credits.available} · в резерве под запросы: {credits.reserved}. Кредит даёт право попросить встречу с любым участником. Его даёт каждая подтверждённая помощь.</p>
        <div className="mt-4">
          <Bar label="Обязательные встречи в этом месяце" value={obligations} max={cfg.receiver_monthly_cap} />
        </div>
        <div className="mt-4">
          <Button href="/meet/request">Попросить о встрече</Button>
        </div>
      </Card>

      {incoming.length > 0 && <SectionTitle>Тебя просят о встрече</SectionTitle>}
      {incoming.map((r) => {
        const pr = pressedBy(r.id, r.meeting_id);
        const other = members.get(r.from_id);
        return (
          <Card key={r.id} highlight className="mb-3.5">
            <Eyebrow>
              {r.status === "postponed" ? `Перенесено: начнётся ${fmtDay(r.postponed_to!)}` : `Осталось ${daysLeft(r.deadline, now)} дн. · до ${fmtDay(r.deadline)}`}
            </Eyebrow>
            <h3 className="text-[19px] font-bold leading-snug">{memberLabel(other)} · «{r.purpose}»</h3>
            <p className="mb-4 mt-2 text-[14px] text-mute">
              {r.uses_credit ? `Обязательная встреча по кредиту: минимум ${cfg.min_meeting_minutes} минут, живьём или по видео.` : "Просьба без кредита: можно отказаться без последствий."}
              {pr.other ? " Он(а) уже нажал(а) «Встретились»." : ""}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {pr.me ? (
                <span className="text-[13.5px] font-semibold text-ok">Ты нажал(а) — ждём вторую сторону</span>
              ) : (
                <ActionForm action={pressMetAction}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <SubmitButton size="sm">Встретились</SubmitButton>
                </ActionForm>
              )}
              {!r.uses_credit && (
                <ActionForm action={declineMeetingAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="outline">Отказаться</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>
        );
      })}

      {outgoing.length > 0 && <SectionTitle>Твои запросы</SectionTitle>}
      {outgoing.map((r) => {
        const pr = pressedBy(r.id, r.meeting_id);
        return (
          <Card key={r.id} className="mb-3.5">
            <Eyebrow>{r.uses_credit ? "С кредитом" : "Без кредита"} · до {fmtDay(r.deadline)}{r.status === "postponed" ? ` · перенесено на ${fmtDay(r.postponed_to!)}` : ""}</Eyebrow>
            <h3 className="text-[17px] font-bold leading-snug">{memberLabel(members.get(r.to_id))} · «{r.purpose}»</h3>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {pr.me ? (
                <span className="text-[13.5px] font-semibold text-ok">Ты нажал(а) — ждём вторую сторону</span>
              ) : (
                <ActionForm action={pressMetAction}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <SubmitButton size="sm">Встретились</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={cancelMeetingAction}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton size="sm" variant="outline">Отменить{r.uses_credit ? " (кредит вернётся)" : ""}</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        );
      })}

      {waitingMe.length > 0 && <SectionTitle>Ждут твоего подтверждения</SectionTitle>}
      {waitingMe.map((m) => (
        <Card key={m.id} className="mb-3.5">
          <h3 className="text-[17px] font-bold leading-snug">{memberLabel(members.get(m.a_id === member.id ? m.b_id : m.a_id))} отметил(а) вашу встречу</h3>
          <div className="mt-4">
            <ActionForm action={pressMetAction}>
              <input type="hidden" name="meeting_id" value={m.id} />
              <SubmitButton size="sm">Встретились</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      ))}

      <SectionTitle>Отметить встречу без запроса</SectionTitle>
      <Card>
        <ActionForm action={startMeetingAction}>
          <SelectField name="other_id" label="С кем встретился" required options={others.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
          <p className="mb-4 mt-3 text-[13px] text-mute">Второй человек подтвердит у себя. Кредиты такая встреча не тратит, но даёт новую связь для Пульса.</p>
          <SubmitButton variant="outline">Мы встретились</SubmitButton>
        </ActionForm>
      </Card>

      {done.length > 0 && <SectionTitle>Последние встречи</SectionTitle>}
      {done.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3 border-b border-line py-3.5 text-[14.5px] last:border-b-0">
          <span className="font-semibold">{memberLabel(members.get(m.a_id === member.id ? m.b_id : m.a_id))}</span>
          <span className="text-[12.5px] text-mute">{fmtDayTime(m.met_at!)}{m.is_first ? " · первая встреча" : ""}{m.via_credit ? " · по кредиту" : ""}</span>
        </div>
      ))}

      {events.length > 0 && <SectionTitle>Живые события клуба</SectionTitle>}
      {events.map((e) => (
        <Card key={e.id} className="mb-3.5">
          <Eyebrow>{fmtDayTime(e.starts_at)}{e.is_open ? " · открытое" : " · для участников"}</Eyebrow>
          <h3 className="text-[17px] font-bold leading-snug">{e.title}</h3>
        </Card>
      ))}
    </>
  );
}

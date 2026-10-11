import { redirect } from "next/navigation";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { daysLeft, fmtDay, plural } from "@/lib/format";
import { cancelRequestAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Моя записка опубликована: отклики и выбор помощника */
export default async function ActiveNotePage() {
  const v = await requireInside();
  const { store, now, member } = v;
  const r = (await store.t.requests.list({ author_id: member.id, status: "active" }))[0];
  if (!r) redirect("/board");
  const responses = await store.t.responses.list({ request_id: r.id });
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const sphere = (await store.t.spheres.get(r.sphere_id))?.name ?? "";
  const chosen = responses.filter((x) => x.is_chosen);

  return (
    <>
      <BackLink />
      <PageHeader title="Доска запросов" lead={responses.length ? `Твоя записка на доске. Откликнулись: ${responses.length}.` : "Твоя записка на доске. Пока без откликов."} />
      <Segmented
        items={[
          { href: "/board/active", label: "Нужна помощь", active: true },
          { href: "/board/help", label: "Могу помочь" },
        ]}
      />
      <div className="mb-3.5 rounded-2xl border border-accent/70 bg-card p-5">
        <div className="mb-2 flex gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
          <span>Мой запрос · {sphere}</span>
          {r.is_urgent && <span className="text-warn">· срочно</span>}
          {r.is_sensitive && <span className="text-info">· деликатно</span>}
        </div>
        <h3 className="text-[17px] font-bold leading-snug">{r.text}</h3>
        <div className="mb-4 mt-2 text-[13px] text-mute">до {fmtDay(r.deadline)} ({daysLeft(r.deadline, now)} дн.) · откликов {responses.length}</div>
        {responses.length > 0 && <Button href="/board/choose" size="sm">Выбрать помощника</Button>}
      </div>

      {chosen.length > 0 && (
        <Card className="mb-3.5">
          <Eyebrow>Выбраны помощники</Eyebrow>
          {chosen.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="text-[15px] font-bold">{memberLabel(members.get(c.responder_id))}</div>
                <div className="text-[12.5px] text-mute">{c.mode === "help" ? "помощь (бесплатно)" : "заказ (за деньги): Пульс и кредит не начисляются"}</div>
              </div>
              {c.mode === "help" && <Button href={`/board/confirm?helper=${c.responder_id}&request=${r.id}`} size="sm">Подтвердить помощь</Button>}
            </div>
          ))}
        </Card>
      )}

      <ActionForm action={cancelRequestAction} className="mt-4">
        <input type="hidden" name="id" value={r.id} />
        <SubmitButton variant="ghost">Снять записку с доски</SubmitButton>
      </ActionForm>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
        <Icon name="lock" className="size-4" />
        У каждого одна записка. Новую можно прикрепить, когда эта закрыта. {plural(responses.length, "Отклик", "Отклика", "Откликов")} можно выбрать по нескольким людям.
      </div>
    </>
  );
}

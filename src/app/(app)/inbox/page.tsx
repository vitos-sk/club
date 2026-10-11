import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { Card } from "@/components/ui/Card";
import { fmtDayTime } from "@/lib/format";
import { markReadAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Входящие: сообщения от клуба. Позже те же сообщения бот пришлёт в Telegram. */
export default async function InboxPage() {
  const v = await requireInside();
  const notes = (await v.store.t.notifications.list({ member_id: v.member.id })).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const unread = notes.filter((n) => !n.read_at).length;
  return (
    <>
      <BackLink />
      <PageHeader title="Входящие" lead={unread ? `Новых сообщений: ${unread}.` : "Все сообщения прочитаны."} />
      {unread > 0 && (
        <ActionForm action={markReadAction} className="mb-5">
          <SubmitButton variant="outline" size="sm">Отметить всё прочитанным</SubmitButton>
        </ActionForm>
      )}
      {notes.length === 0 && <p className="text-[15px] text-mute">Сообщений пока нет.</p>}
      {notes.map((n) => (
        <Card key={n.id} highlight={!n.read_at} className="mb-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-mute">{fmtDayTime(n.created_at)}{!n.read_at && " · новое"}</div>
          <p className="text-[15px] leading-snug">{n.text}</p>
          {n.link && <Link href={n.link} className="mt-3 inline-block text-[13.5px] font-bold text-accent">Открыть →</Link>}
        </Card>
      ))}
    </>
  );
}

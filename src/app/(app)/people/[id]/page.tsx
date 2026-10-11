import { notFound } from "next/navigation";
import { getPublicHelpHistory, getPulseFor } from "@core/access";
import { creditBalance } from "@core/credits";
import { BackLink } from "@/components/shell/BackLink";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { ChipRow, Chip } from "@/components/ui/Chip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDay, STATUS_LABEL } from "@/lib/format";
import { requireInside } from "@/server/club";

/** Профиль участника, как его видят другие: статус, навыки, истории помощи (отзывы). Без числа Пульса. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await requireInside();
  const { id } = await params;
  const m = await v.store.t.members.get(id);
  if (!m || ["candidate", "left", "expelled"].includes(m.status)) notFound();
  const history = await getPublicHelpHistory(v.store, v.member.id, m.id);
  const spheres = await v.store.t.spheres.list();
  const sphere = (sid: string) => spheres.find((s) => s.id === sid)?.name ?? "";
  const pulse = v.staff || v.member.id === m.id ? await getPulseFor(v.store, v.now, v.member.id, m.id) : null;
  const credits = v.staff ? await creditBalance(v.store, m.id) : null;
  const isMe = m.id === v.member.id;

  return (
    <>
      <BackLink href="/people">Люди клуба</BackLink>
      <div className="mb-6">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-mute">{m.is_founder ? "Основатель · " : ""}{STATUS_LABEL[m.status]}</div>
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">{m.number != null ? `№${m.number} ` : ""}{m.name}</h1>
        {m.niche && <p className="mt-1 text-[15px] text-mute">{m.niche}</p>}
      </div>
      {m.skills.length > 0 && <ChipRow className="mb-6">{m.skills.map((s) => <Chip key={s}>{s}</Chip>)}</ChipRow>}

      {!isMe && (
        <div className="mb-2 space-y-3">
          <Button href={`/meet/request?to=${m.id}`}>Попросить о встрече</Button>
          <Button href={`/board/confirm?helper=${m.id}`} variant="outline">Он(а) мне помог(ла) — подтвердить</Button>
          {m.tg_username && (
            <a href={`https://t.me/${m.tg_username}`} className="inline-flex w-full items-center justify-center rounded-xl border border-line px-5 py-4 text-[15.5px] font-bold text-accent">Написать в Telegram</a>
          )}
        </div>
      )}

      {pulse && (
        <Card className="mt-5">
          <Eyebrow>{isMe ? "Твой Пульс" : "Пульс (видят только Совет и сам человек)"}</Eyebrow>
          <b className="text-[34px] font-extrabold text-accent">{pulse.value}</b>
          {credits && <p className="mt-1 text-[13px] text-mute">Кредитов свободно: {credits.available}, в резерве: {credits.reserved}</p>}
        </Card>
      )}

      <SectionTitle>Истории помощи</SectionTitle>
      {history.length === 0 && <p className="text-[14.5px] text-mute">Подтверждённой помощи пока нет.</p>}
      {history.map((h) => (
        <Card key={h.help_id} className="mb-3">
          <p className="text-[16px] font-medium italic leading-snug">«{h.review}»</p>
          <div className="mt-3 text-[12.5px] font-semibold text-mute">для {h.receiver} · {sphere(h.sphere_id)} · {fmtDay(h.at)}</div>
        </Card>
      ))}
    </>
  );
}

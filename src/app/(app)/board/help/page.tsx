import Link from "next/link";
import { listBoard } from "@core/board";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup } from "@/components/forms/Choice";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { daysLeft, fmtDay, plural } from "@/lib/format";
import { createOfferAction, deactivateOfferAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Доска запросов — вкладка «Могу помочь»: чужие записки и предложения */
export default async function BoardHelpPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const { store, now, member } = v;
  const board = await listBoard(store, now, member.id);
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const spheres = await store.t.spheres.list();
  const sphereName = (id: string) => spheres.find((s) => s.id === id)?.name ?? "";
  const myResponses = new Map((await store.t.responses.list({ responder_id: member.id })).map((r) => [r.request_id, r]));
  const myOffer = board.offers.find((o) => o.author_id === member.id);

  return (
    <>
      <BackLink />
      <PageHeader title="Доска запросов" lead="Выбери записку, в которой можешь помочь. Автор сам выберет помощника." />
      <Segmented
        items={[
          { href: "/board", label: "Нужна помощь" },
          { href: "/board/help", label: "Могу помочь", active: true },
        ]}
      />
      {sp.sent && <p role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Отклик отправлен. Автор выберет помощника сам.</p>}

      {board.requests.length === 0 && <p className="text-[15px] text-mute">Пока записок нет.</p>}
      {board.requests.map(({ request: r, backed, responses }) => {
        const own = r.author_id === member.id;
        const mine = myResponses.get(r.id);
        return (
          <div key={r.id} className={`mb-3.5 rounded-2xl border bg-card p-5 ${own ? "border-accent/70" : "border-line"}`}>
            <div className="mb-2 flex flex-wrap gap-x-2 text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
              <span>{own ? "Мой запрос" : sphereName(r.sphere_id)}</span>
              {r.is_urgent && <span className="text-warn">· срочно</span>}
              {r.is_sensitive && <span className="text-info">· деликатно</span>}
              {!backed && <span>· в конце очереди</span>}
            </div>
            <h3 className="text-[17px] font-bold leading-snug">{r.text}</h3>
            <div className="mb-4 mt-2 text-[13px] text-mute">
              {memberLabel(members.get(r.author_id))} · до {fmtDay(r.deadline)} ({daysLeft(r.deadline, now)} дн.) · откликов {responses}
            </div>
            {own ? (
              <Button href="/board/active" size="sm">Открыть мою записку</Button>
            ) : mine ? (
              <p className="text-[13.5px] font-semibold text-ok">Ты откликнулся: {mine.mode === "help" ? "помощь (бесплатно)" : "заказ (за деньги)"}{mine.is_chosen ? " · тебя выбрали" : ""}</p>
            ) : (
              <Button href={`/board/respond?request=${r.id}`} variant="outline" size="sm">Откликнуться</Button>
            )}
          </div>
        );
      })}

      <SectionTitle>Предложения участников</SectionTitle>
      {board.offers.length === 0 && <p className="text-[15px] text-mute">Предложений пока нет.</p>}
      {board.offers.map((o) => {
        const author = members.get(o.author_id);
        return (
          <Card key={o.id} className="mb-3.5">
            <Eyebrow>{sphereName(o.sphere_id)}</Eyebrow>
            <h3 className="text-[17px] font-bold leading-snug">{o.text}</h3>
            <div className="mb-4 mt-2 text-[13px] text-mute">{memberLabel(author)}</div>
            {o.author_id === member.id ? (
              <ActionForm action={deactivateOfferAction}>
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton variant="outline" size="sm">Выключить предложение</SubmitButton>
              </ActionForm>
            ) : (
              <div className="flex gap-2">
                <Link href={`/people/${o.author_id}`} className="rounded-xl border border-line px-4 py-2.5 text-[13.5px] font-bold">Профиль</Link>
                {author?.tg_username && (
                  <a href={`https://t.me/${author.tg_username}`} className="rounded-xl border border-line px-4 py-2.5 text-[13.5px] font-bold text-accent">Написать в Telegram</a>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {!myOffer && (
        <>
          <SectionTitle>Моё предложение</SectionTitle>
          <ActionForm action={createOfferAction}>
            <Field multiline name="text" label="Чем можешь помочь" placeholder="Например: резюме на немецком + 30 минут разбора" required />
            <ChoiceGroup className="mt-6" name="sphere" label="Сфера" required defaultValue={spheres[0]?.id} options={spheres.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="mt-6">
              <SubmitButton>Предложить клубу</SubmitButton>
            </div>
            <p className="mt-3 text-[13px] text-mute">Одно активное предложение на человека.</p>
          </ActionForm>
        </>
      )}
      <p className="mt-6 text-[12.5px] text-mute">{plural(board.requests.length, "Открыта", "Открыто", "Открыто")} записок: {board.requests.length}. Очередь: сначала обеспеченные вкладом, среди них срочные.</p>
    </>
  );
}

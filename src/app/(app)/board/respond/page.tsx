import { redirect } from "next/navigation";
import { canSeeRequest, isStaff } from "@core/access";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup } from "@/components/forms/Choice";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { respondAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Отклик на чужую записку. Режим «помощь / заказ» выбирается ДО начала работы и потом не меняется. */
export default async function RespondPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const r = sp.request ? await v.store.t.requests.get(sp.request) : undefined;
  if (!r || r.status !== "active" || r.author_id === v.member.id || !canSeeRequest(r, v.member.id, await isStaff(v.store, v.member, v.now))) redirect("/board/help");
  const author = await v.store.t.members.get(r.author_id);

  return (
    <>
      <BackLink href="/board/help">Назад</BackLink>
      <PageHeader title="Чем ты можешь помочь?" lead="Автор увидит твоё сообщение и сам выберет, кому доверить. Чат в Telegram откроется только с выбранным." />
      <Card className="mb-5">
        <Eyebrow>Записка · {memberLabel(author)}</Eyebrow>
        <p className="text-[16px] font-semibold leading-snug">{r.text}</p>
      </Card>
      <ActionForm action={respondAction}>
        <input type="hidden" name="request_id" value={r.id} />
        <ChoiceGroup
          name="mode"
          label="Как ты это сделаешь"
          required
          defaultValue="help"
          options={[
            { value: "help", label: "Помощь · бесплатно" },
            { value: "order", label: "Заказ · за деньги" },
          ]}
        />
        <p className="mb-6 mt-3 text-[13px] leading-snug text-mute">Помощь даёт тебе Пульс и кредит на встречу. Заказ — по клубным условиям, без Пульса и кредита. После отправки режим не меняется.</p>
        <Field multiline name="message" label="Твоё сообщение" placeholder="Одной строкой: что именно можешь сделать" maxLength={500} />
        <div className="mt-7">
          <SubmitButton>Отправить отклик</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

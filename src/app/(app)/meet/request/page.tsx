import { creditBalance } from "@core/credits";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup } from "@/components/forms/Choice";
import { Field, SelectField } from "@/components/ui/Field";
import { requestMeetingAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Попросить о встрече. С кредитом получатель обязан встретиться в течение двух недель; без кредита — отказ без последствий. */
export default async function RequestMeetPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const credits = await creditBalance(v.store, v.member.id);
  const others = (await v.store.t.members.list()).filter((m) => m.id !== v.member.id && ["probation", "member", "partner", "council"].includes(m.status));

  return (
    <>
      <BackLink href="/meet">Зал встреч</BackLink>
      <PageHeader title="Попросить о встрече" lead="С кредитом человек обязан встретиться в течение 14 дней, минимум 30 минут. Больше двух обязательных встреч в месяц на одного человека не бывает — лишние переносятся." />
      <ActionForm action={requestMeetingAction}>
        <SelectField name="to_id" label="С кем" required defaultValue={sp.to} options={others.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
        <ChoiceGroup
          className="mt-6"
          name="credit"
          label={`Использовать кредит (свободно: ${credits.available})`}
          required
          defaultValue={credits.available > 0 ? "yes" : "no"}
          options={[
            { value: "yes", label: "С кредитом · обязательная встреча", disabled: credits.available < 1 },
            { value: "no", label: "Без кредита · по желанию" },
          ]}
        />
        <Field className="mt-6" name="purpose" required maxLength={300} label="Зачем (одной строкой)" placeholder="Например: обсудить сайт для моего Gewerbe" />
        <p className="mt-3 text-[13px] text-mute">Первая встреча пары — в публичном месте или онлайн.</p>
        <div className="mt-7">
          <SubmitButton>Отправить запрос</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

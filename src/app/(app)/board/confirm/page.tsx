import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup } from "@/components/forms/Choice";
import { Field, SelectField } from "@/components/ui/Field";
import { confirmHelpAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Подтверждение полученной помощи: кто помог, сфера, оценка, короткий отзыв. Подтверждает только получатель. */
export default async function ConfirmHelpPage({ searchParams }: { searchParams: Promise<{ helper?: string; request?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const { store, member } = v;
  const spheres = await store.t.spheres.list();
  const people = (await store.t.members.list()).filter((m) => m.id !== member.id && ["probation", "member", "partner", "council"].includes(m.status));
  const preset = sp.helper ? await store.t.members.get(sp.helper) : undefined;

  return (
    <>
      <BackLink href={sp.request ? "/board/active" : "/board"}>Назад</BackLink>
      <PageHeader title="Подтверди помощь" lead={preset ? `От ${memberLabel(preset)}. Это поднимает его Пульс и даёт кредит на встречу, поэтому оценивай честно.` : "Выбери, кто тебе помог. Это поднимает его Пульс и даёт кредит на встречу, поэтому оценивай честно."} />
      <ActionForm action={confirmHelpAction}>
        {sp.request && <input type="hidden" name="request_id" value={sp.request} />}
        {preset ? (
          <input type="hidden" name="helper_id" value={preset.id} />
        ) : (
          <SelectField name="helper_id" label="Кто помог" required options={people.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
        )}
        <ChoiceGroup className="mt-7" name="sphere" label="В какой сфере помогли" required defaultValue={spheres[0]?.id} options={spheres.map((s) => ({ value: s.id, label: s.name }))} />
        <ChoiceGroup
          className="mt-7"
          name="grade"
          label="Насколько это было важно"
          required
          defaultValue="3"
          options={[
            { value: "1", label: "Мелочь" },
            { value: "3", label: "Серьёзно" },
            { value: "6", label: "Изменило мою ситуацию" },
          ]}
        />
        <Field multiline name="review" required maxLength={500} className="mt-7" label="Короткий отзыв" placeholder="Одной-двумя строками" />
        <p className="mt-3 text-[13px] text-mute">Повторные подтверждения от одного человека весят меньше (1/2, 1/3…), взаимные — в четыре раза меньше. Это защита от накрутки, а не наказание.</p>
        <div className="mt-7">
          <SubmitButton>Подтвердить</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

import { isBackedByContribution } from "@core/board";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup, Toggle } from "@/components/forms/Choice";
import { Field } from "@/components/ui/Field";
import { createRequestAction } from "@/app/actions";
import { monthKey } from "@core/time";
import { requireInside } from "@/server/club";

/** Новая записка */
export default async function NewNotePage() {
  const v = await requireInside();
  const { store, now, member } = v;
  const spheres = await store.t.spheres.list();
  const backed = await isBackedByContribution(store, now, member.id);
  const mine = await store.t.requests.list({ author_id: member.id });
  const urgentUsed = mine.some((r) => r.is_urgent && monthKey(new Date(r.created_at)) === monthKey(now));
  const others = (await store.t.members.list()).filter((m) => m.id !== member.id && ["member", "partner", "council"].includes(m.status));
  const urgentHint = !backed ? "Недоступно: за 60 дней нет подтверждённой помощи" : urgentUsed ? "Недоступно: в этом месяце уже было" : "Можно раз в месяц, чтобы пометка не обесценилась";

  return (
    <>
      <BackLink href="/board">Доска</BackLink>
      <PageHeader title="Новая записка" lead="Напиши конкретно, что нужно. Чем яснее, тем быстрее откликнутся." />
      <ActionForm action={createRequestAction}>
        <Field multiline name="text" label="Что нужно?" placeholder="Например: нужна помощь с договором аренды" required />
        <ChoiceGroup className="mt-7" name="sphere" label="Сфера" required defaultValue={spheres[0]?.id} options={spheres.map((s) => ({ value: s.id, label: s.name }))} />
        <ChoiceGroup className="mt-7" name="days" label="Срок" defaultValue="7" options={[{ value: "3", label: "3 дня" }, { value: "7", label: "Неделя" }, { value: "14", label: "2 недели" }, { value: "30", label: "Месяц" }]} />
        <div className="mt-7">
          <Toggle name="urgent" title="Срочно" hint={urgentHint} disabled={!backed || urgentUsed} />
          <Toggle name="sensitive" title="Деликатно" hint="Увидят только выбранные тобой люди и Совет" />
        </div>
        <details className="mt-4 rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-[14px] font-bold text-accent-2">Кому показать деликатный запрос</summary>
          <p className="mb-3 mt-2 text-[12.5px] text-mute">Работает, только если включена пометка «Деликатно». Совет видит такие запросы всегда.</p>
          <ChoiceGroup type="checkbox" name="visible_to" options={others.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
        </details>
        <div className="mt-7">
          <SubmitButton>Прикрепить на доску</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

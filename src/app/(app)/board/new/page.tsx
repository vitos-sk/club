import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { spheres } from "@/lib/mock";

/** Новая записка */
export default function NewNotePage() {
  return (
    <>
      <BackLink href="/board">Доска</BackLink>
      <PageHeader title="Новая записка" lead="Напиши конкретно, что нужно. Чем яснее, тем быстрее откликнутся." />
      <Field multiline label="Что нужно?" placeholder="Например: нужна помощь с договором аренды" />

      <div className="mb-3 mt-7 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">Сфера</div>
      <ChipRow>
        {spheres.map((s, i) => (
          <Chip key={s} active={i === 1}>
            {s}
          </Chip>
        ))}
      </ChipRow>

      <div className="mb-3 mt-7 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">Срок</div>
      <ChipRow>
        {["3 дня", "Неделя", "2 недели", "Месяц"].map((s, i) => (
          <Chip key={s} active={i === 1}>
            {s}
          </Chip>
        ))}
      </ChipRow>

      <div className="mt-7 flex items-center gap-4 border-y border-line py-4">
        <div className="flex-1">
          <b className="block text-[16px]">Срочно</b>
          <span className="text-[13px] text-mute">Можно раз в месяц, чтобы пометка не обесценилась</span>
        </div>
        <span className="relative h-7 w-12 rounded-full bg-line">
          <i className="absolute left-1 top-1 size-5 rounded-full bg-mute" />
        </span>
      </div>

      <div className="mt-7">
        <Button href="/board/active">Прикрепить на доску</Button>
      </div>
    </>
  );
}

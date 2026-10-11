import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";

/** Пауза: до трёх месяцев раз в год */
export default function PausePage() {
  return (
    <>
      <BackLink href="/study">Кабинет</BackLink>
      <PageHeader title="Пауза" lead="Болезнь, ребёнок, экзамены, большое событие. До трёх месяцев раз в год. Пульс не тает, статус сохраняется." />
      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">На сколько</div>
      <ChipRow>
        <Chip active>1 месяц</Chip>
        <Chip>2 месяца</Chip>
        <Chip>3 месяца</Chip>
      </ChipRow>
      <p className="mt-5 text-[13px] text-mute">Причину называть не обязательно.</p>
      <div className="mt-7">
        <Button href="/study">Включить паузу</Button>
      </div>
    </>
  );
}

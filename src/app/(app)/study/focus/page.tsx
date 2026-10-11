import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";

/** Фокус недели: одна главная задача */
export default function FocusPage() {
  return (
    <>
      <BackLink href="/study">Кабинет</BackLink>
      <PageHeader title="Главное на этой неделе" lead="Одно действие к твоей цели. Конкретно и проверяемо." />
      <Field multiline label="Твоя задача" placeholder="Например: отправить 5 предложений клиентам" />
      <ChipRow className="mt-4">
        <Chip>Записаться на Gewerbe-термин</Chip>
        <Chip>Провести 2 созвона</Chip>
        <Chip>Сделать первый экран сайта</Chip>
      </ChipRow>
      <p className="mt-5 text-[13px] text-mute">Бот напомнит в понедельник в 10:00. Когда сделаешь, отметь шаг в Кабинете: Движение +3.</p>
      <div className="mt-7">
        <Button href="/study">Зафиксировать</Button>
      </div>
    </>
  );
}

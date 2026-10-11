import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { requests } from "@/lib/mock";

/** Отклик на чужую записку: одна строка «чем могу помочь» */
export default function RespondPage() {
  const r = requests[0];
  return (
    <>
      <BackLink href="/board/help">Назад</BackLink>
      <PageHeader title="Чем ты можешь помочь?" lead="Автор увидит твоё сообщение и сам выберет, кому доверить. Чат в Telegram откроется только с выбранным." />
      <Card className="mb-5">
        <Eyebrow>Записка</Eyebrow>
        <p className="text-[16px] font-semibold leading-snug">{r.title}</p>
      </Card>
      <Field multiline label="Твоё сообщение" placeholder="Одной строкой: что именно можешь сделать" />
      <ChipRow className="mt-4">
        <Chip>Могу сделать сегодня</Chip>
        <Chip>Знаю, как это сделать</Chip>
        <Chip>Знаю нужного человека</Chip>
      </ChipRow>
      <div className="mt-7">
        <Button href="/board/help">Отправить отклик</Button>
      </div>
    </>
  );
}

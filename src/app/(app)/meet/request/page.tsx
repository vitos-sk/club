import { PersonRow } from "@/components/club/PersonRow";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

/** Попросить о встрече: участник обязан встретиться в течение двух недель */
export default function RequestMeetPage() {
  return (
    <>
      <BackLink href="/meet">Зал встреч</BackLink>
      <PageHeader title="Попросить о встрече" lead="Участник обязан встретиться в течение двух недель. Один и тот же человек — не чаще раза в месяц." />
      <PersonRow n={26} title="Дизайн и digital" sub="Пара месяца · вы ещё не знакомы" />
      <Field className="mt-6" label="Зачем (одной строкой)" placeholder="Например: обсудить сайт для моего Gewerbe" />
      <div className="mt-7">
        <Button href="/meet">Отправить запрос</Button>
      </div>
    </>
  );
}

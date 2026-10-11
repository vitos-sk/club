import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Bar } from "@/components/ui/Bar";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";

/** Совет: комната для Партнёров. Участнику показывается, что нужно для доступа */
export default function CouncilPage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Совет" lead="Комната для Партнёров и выше. Твой следующий ключ — «Партнёр»." />
      <Card>
        <Eyebrow>Что нужно для доступа</Eyebrow>
        <Bar label="Пульс" value={78} max={80} />
        <Bar label="Серьёзная помощь" value={2} max={3} />
      </Card>

      <SectionTitle>Что внутри</SectionTitle>
      <Card className="py-1">
        {["Анкеты кандидатов и голосование", "Подозрительные связи и жалобы", "«Плечо клуба»: помощь в серьёзной беде", "Решения Совета публикуются с причиной"].map((t) => (
          <div key={t} className="flex items-center gap-3.5 border-b border-line py-4 text-[15px] last:border-b-0">
            <Icon name="lock" className="size-[18px] text-mute" />
            {t}
          </div>
        ))}
      </Card>
    </>
  );
}

import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { benefits } from "@/lib/mock";

/** Что даёт клуб: всё полезное участнику на одном экране */
export default function BenefitsPage() {
  return (
    <>
      <BackLink href="/study">Кабинет</BackLink>
      <PageHeader title="Что даёт клуб" lead="Главное — настоящий статус: то, как на тебя смотрят люди при встрече." />
      {benefits.map((b) => (
        <Card key={b.title} className="mb-3.5">
          <h2 className="mb-3 text-[20px] font-extrabold">{b.title}</h2>
          <ul className="space-y-2.5">
            {b.items.map((it) => (
              <li key={it} className="flex gap-3 text-[14.5px] leading-snug">
                <Icon name="check" className="mt-0.5 size-[18px] text-accent" />
                {it}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

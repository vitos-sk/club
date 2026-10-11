import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { articles, person } from "@/lib/mock";

/** Библиотека: фишки и разборы */
export default function LibraryPage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Библиотека" lead="Фишки, идеи и разборы, за которые снаружи платят. Для участников бесплатно. Лучшее выбирает Совет." />
      <ChipRow className="mb-6">
        {["Все", "Finanzamt", "Gewerbe", "Найм", "Квартира", "Фишки"].map((t, i) => (
          <Chip key={t} active={i === 0}>
            {t}
          </Chip>
        ))}
      </ChipRow>
      <Card className="py-1">
        {articles.map((a) => (
          <Link key={a.slug} href={`/library/${a.slug}`} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card-2 text-accent">
              <Icon name="book" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold leading-snug">{a.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-mute">
                {a.tag} · {a.min} мин · от {person(a.by)}
              </span>
            </span>
            <Icon name="chev" className="size-[18px] text-mute" />
          </Link>
        ))}
      </Card>
    </>
  );
}

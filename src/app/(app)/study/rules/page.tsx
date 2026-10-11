import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { laws } from "@/lib/mock";

/** Десять законов клуба */
export default function RulesPage() {
  return (
    <>
      <BackLink href="/study">Кабинет</BackLink>
      <PageHeader title="Десять законов" lead="У клуба десять законов, потому что только с правилами строятся империи." />
      <Card className="py-1">
        {laws.map((l, i) => (
          <div key={l} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card-2 text-[14px] font-extrabold text-accent">{i + 1}</span>
            <span className="text-[15.5px] font-semibold leading-snug">{l}</span>
          </div>
        ))}
      </Card>
      <p className="mt-4 text-[13px] text-mute">Подписаны 14.09.2026.</p>
    </>
  );
}

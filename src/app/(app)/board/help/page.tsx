import { NoteCard } from "@/components/club/NoteCard";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { offers, person, requests } from "@/lib/mock";

/** Доска запросов — вкладка «Могу помочь»: чужие записки и предложения */
export default function BoardHelpPage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Доска запросов" lead="Выбери записку, в которой можешь помочь. Автор сам выберет помощника." />
      <Segmented
        items={[
          { href: "/board", label: "Нужна помощь" },
          { href: "/board/help", label: "Могу помочь", active: true },
        ]}
      />

      {requests.map((r) => (
        <NoteCard key={r.id} note={r} href="/board/respond" />
      ))}

      <SectionTitle>Предложения участников</SectionTitle>
      {offers.map((o) => (
        <Card key={o.id} className="mb-3.5">
          <Eyebrow>{o.sphere}</Eyebrow>
          <h3 className="text-[17px] font-bold leading-snug">{o.title}</h3>
          <div className="mb-4 mt-2 text-[13px] text-mute">{person(o.by)}</div>
          <Button variant="outline" size="sm">
            Написать
          </Button>
        </Card>
      ))}
    </>
  );
}

import Link from "next/link";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { STATUS_LABEL } from "@/lib/format";
import { requireInside } from "@/server/club";

/** Люди клуба. Видны номер, имя, ниша, навыки и статус. Числа Пульса не показываются. Публичного рейтинга нет. */
export default async function PeoplePage() {
  const v = await requireInside();
  const people = (await v.store.t.members.list())
    .filter((m) => ["probation", "member", "partner", "council", "stopped", "paused"].includes(m.status))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  return (
    <>
      <BackLink />
      <PageHeader title="Люди клуба" lead="Кто здесь и чем может помочь. Публичного рейтинга нет — смотри отзывы в профиле." />
      <div>
        {people.map((m) => (
          <Link key={m.id} href={`/people/${m.id}`} className="flex items-center gap-3.5 border-b border-line py-4 last:border-b-0">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card-2 text-[13px] font-extrabold text-accent">{m.number != null ? String(m.number).padStart(2, "0") : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold leading-snug">{m.name}</span>
              <span className="block text-[13px] leading-snug text-mute">{[m.niche, STATUS_LABEL[m.status]].filter(Boolean).join(" · ")}</span>
            </span>
            <Icon name="chev" className="size-[18px] text-mute" />
          </Link>
        ))}
      </div>
    </>
  );
}

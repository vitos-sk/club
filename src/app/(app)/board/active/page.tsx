import { NoteCard } from "@/components/club/NoteCard";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Icon } from "@/components/ui/Icon";
import { myRequest } from "@/lib/mock";

/** Моя записка опубликована, на неё откликнулись */
export default function ActiveNotePage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Доска запросов" lead="Твоя записка на доске. На неё откликнулись трое." />
      <Segmented
        items={[
          { href: "/board/active", label: "Нужна помощь", active: true },
          { href: "/board/help", label: "Могу помочь" },
        ]}
      />
      <NoteCard
        mine
        note={{ sphere: myRequest.sphere, title: myRequest.title, due: myRequest.due, replies: myRequest.replies }}
        action="Выбрать помощника"
        href="/board/choose"
      />
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
        <Icon name="lock" className="size-4" />
        У каждого одна записка. Новую можно прикрепить, когда эта закрыта.
      </div>
    </>
  );
}

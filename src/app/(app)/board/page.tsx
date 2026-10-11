import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";

/** Доска запросов — вкладка «Нужна помощь»: у человека ещё нет записки */
export default function BoardPage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Доска запросов" lead="Прикрепи просьбу: откликнутся те, кто может. Выбираешь ты." />
      <Segmented
        items={[
          { href: "/board", label: "Нужна помощь", active: true },
          { href: "/board/help", label: "Могу помочь" },
        ]}
      />

      <div className="rounded-2xl border-[1.5px] border-dashed border-line p-6">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Твоя записка</div>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-tight">Тебе что-то нужно?</h2>
        <p className="mb-5 mt-2 text-[15px] text-mute">Опиши, что именно, и откликнутся те, кто может помочь.</p>
        <Button href="/board/new">
          <Icon name="plus" className="size-5" />
          Прикрепить записку
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
        <Icon name="lock" className="size-4" />
        У каждого одна записка. Новую можно прикрепить, когда старая закрыта.
      </div>
    </>
  );
}

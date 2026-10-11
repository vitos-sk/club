import { redirect } from "next/navigation";
import { isBackedByContribution } from "@core/board";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { requireInside } from "@/server/club";

/** Доска запросов — вкладка «Нужна помощь»: у человека ещё нет записки */
export default async function BoardPage({ searchParams }: { searchParams: Promise<{ confirmed?: string; credit?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const mine = (await v.store.t.requests.list({ author_id: v.member.id, status: "active" }))[0];
  if (mine && !sp.confirmed) redirect("/board/active");
  const backed = await isBackedByContribution(v.store, v.now, v.member.id);
  const helper = sp.confirmed ? await v.store.t.members.get(sp.confirmed) : undefined;

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

      {helper && (
        <div role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold leading-snug text-ok">
          Помощь от {memberLabel(helper)} подтверждена. {sp.credit === "1" ? "Ему(ей) начислен кредит на встречу." : "Кредит не начислен: на счету уже максимум."}
        </div>
      )}

      <div className="rounded-2xl border-[1.5px] border-dashed border-line p-6">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Твоя записка</div>
        <h2 className="text-[26px] font-extrabold leading-tight tracking-tight">Тебе что-то нужно?</h2>
        <p className="mb-5 mt-2 text-[15px] text-mute">Опиши, что именно, и откликнутся те, кто может помочь.</p>
        <Button href="/board/new">
          <Icon name="plus" className="size-5" />
          Прикрепить записку
        </Button>
      </div>

      {!backed && (
        <div className="mt-4 rounded-xl border border-warn/50 bg-warn/10 p-4 text-[13.5px] leading-snug text-warn">
          За последние 60 дней у тебя нет подтверждённой помощи другим. Твоя записка встанет в конец очереди, а пометка «срочно» будет недоступна. Помоги кому-нибудь — и это изменится.
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
        <Icon name="lock" className="size-4" />
        У каждого одна записка. Новую можно прикрепить, когда старая закрыта.
      </div>

      <div className="mt-6 space-y-3">
        <Button href="/board/confirm" variant="outline">
          Мне помогли — подтвердить помощь
        </Button>
      </div>
    </>
  );
}

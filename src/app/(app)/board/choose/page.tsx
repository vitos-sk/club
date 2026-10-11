import { redirect } from "next/navigation";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { chooseAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Выбор помощника среди откликнувшихся */
export default async function ChooseHelperPage() {
  const v = await requireInside();
  const { store, member } = v;
  const r = (await store.t.requests.list({ author_id: member.id, status: "active" }))[0];
  if (!r) redirect("/board");
  const responses = await store.t.responses.list({ request_id: r.id });
  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));

  return (
    <>
      <BackLink href="/board/active">Назад</BackLink>
      <PageHeader title="Кто откликнулся" lead="Выбери, кому доверить задачу. Можно выбрать нескольких. Режим «помощь» или «заказ» человек выбрал сам, до начала работы, — он не меняется." />
      {responses.length === 0 && <p className="text-[15px] text-mute">Пока никто не откликнулся.</p>}
      <div>
        {responses.map((x) => {
          const m = members.get(x.responder_id);
          return (
            <div key={x.id} className="flex items-center gap-3.5 border-b border-line py-4 last:border-b-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card-2 text-[13px] font-extrabold text-accent">
                {m?.number != null ? String(m.number).padStart(2, "0") : "—"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-bold leading-snug">{memberLabel(m)}</div>
                <div className="mt-0.5 text-[13px] leading-snug text-mute">«{x.message || "без комментария"}»</div>
                <div className={`mt-1 text-[11.5px] font-bold uppercase tracking-[0.1em] ${x.mode === "help" ? "text-ok" : "text-info"}`}>
                  {x.mode === "help" ? "помощь · бесплатно" : "заказ · за деньги, без Пульса"}
                </div>
              </div>
              {x.is_chosen ? (
                <span className="text-[12px] font-bold text-ok">Выбран</span>
              ) : (
                <ActionForm action={chooseAction}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="response_id" value={x.id} />
                  <SubmitButton size="sm">Доверить</SubmitButton>
                </ActionForm>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

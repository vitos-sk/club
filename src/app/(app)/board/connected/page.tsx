import { redirect } from "next/navigation";
import { memberLabel } from "@core/members";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { requireInside } from "@/server/club";

/** Помощник выбран: общение дальше в Telegram */
export default async function ConnectedPage({ searchParams }: { searchParams: Promise<{ request?: string; helper?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const helper = sp.helper ? await v.store.t.members.get(sp.helper) : undefined;
  const req = sp.request ? await v.store.t.requests.get(sp.request) : undefined;
  if (!helper || !req || req.author_id !== v.member.id) redirect("/board/active");
  const resp = (await v.store.t.responses.list({ request_id: req.id, responder_id: helper.id }))[0];
  const isHelp = resp?.mode === "help";

  return (
    <>
      <div className="mx-auto mb-5 mt-6 grid size-16 place-items-center rounded-full bg-ok/15 text-ok">
        <Icon name="check" className="size-8" />
      </div>
      <div className="text-center">
        <PageHeader title={`Вы на связи с ${memberLabel(helper)}`} lead="Задача доверена. Дальше общайтесь напрямую в Telegram." />
      </div>
      <Card className="mb-6">
        <Eyebrow>Бот NEXT · вам обоим</Eyebrow>
        <p className="text-[15px] leading-snug">
          Ты доверил(а) {memberLabel(helper)} задачу «{req.text}». Напишите друг другу в Telegram.
          {isHelp ? " Когда помощь будет получена — подтверди её здесь: это даёт помощнику Пульс и кредит." : " Это заказ за деньги по клубным условиям: Пульс и кредит за него не начисляются."}
        </p>
      </Card>
      <div className="space-y-3">
        {helper.tg_username && (
          <a href={`https://t.me/${helper.tg_username}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-4 text-[15.5px] font-bold text-ink">
            <Icon name="telegram" className="size-5" />
            Открыть чат в Telegram
          </a>
        )}
        {isHelp && (
          <Button href={`/board/confirm?helper=${helper.id}&request=${req.id}`} variant="outline">
            Помощь получена? Подтвердить
          </Button>
        )}
        <Button href="/board/active" variant="ghost">
          Позже
        </Button>
      </div>
    </>
  );
}

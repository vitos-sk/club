import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { myRequest } from "@/lib/mock";

/** Помощник выбран: общение дальше в Telegram */
export default function ConnectedPage() {
  return (
    <>
      <div className="mx-auto mb-5 mt-6 grid size-16 place-items-center rounded-full bg-ok/15 text-ok">
        <Icon name="check" className="size-8" />
      </div>
      <div className="text-center">
        <PageHeader title="Вы на связи с №12" lead="Задача доверена. Дальше общайтесь напрямую в Telegram." />
      </div>
      <Card className="mb-6">
        <Eyebrow>Бот NEXT · вам обоим</Eyebrow>
        <p className="text-[15px] leading-snug">
          Участник №07 доверил(а) №12 задачу «{myRequest.title}». Напишите друг другу в Telegram. Через 3 дня я спрошу, как прошло.
        </p>
      </Card>
      <div className="space-y-3">
        <Button>
          <Icon name="telegram" className="size-5" />
          Открыть чат в Telegram
        </Button>
        <Button href="/board/confirm" variant="outline">
          Помощь получена? Подтвердить
        </Button>
        <Button href="/board/active" variant="ghost">
          Позже
        </Button>
      </div>
      <p className="mt-5 text-center text-[13px] text-mute">Остальным, кто откликнулся, ушло «спасибо за отклик». Чат только с выбранным.</p>
    </>
  );
}

import { QrPlaceholder } from "@/components/club/QrPlaceholder";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Bar } from "@/components/ui/Bar";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { person, slots } from "@/lib/mock";

/** Зал встреч: счётчик, запрос встречи, QR, пара месяца */
export default function MeetPage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Зал встреч" lead="Закон №2: каждый месяц — новая связь. Встреча засчитывается, когда вы оба показали друг другу QR." />

      <Card>
        <Eyebrow>В октябре</Eyebrow>
        <Bar label="Обязательные встречи" value={3} max={4} />
      </Card>

      <SectionTitle>Тебя просят о встрече</SectionTitle>
      <Card highlight>
        <Eyebrow>Осталось 12 дней</Eyebrow>
        <h3 className="text-[19px] font-bold leading-snug">{person(18)} · «Выход на рынок Австрии»</h3>
        <p className="mb-4 mt-2 text-[14px] text-mute">Минимум 30 минут. Отказаться нельзя, перенести можно один раз. Выбери время:</p>
        <div className="space-y-2.5">
          {slots.map((s) => (
            <Button key={s} variant="outline">
              {s}
            </Button>
          ))}
        </div>
      </Card>

      <SectionTitle>Мой QR</SectionTitle>
      <Card className="text-center">
        <Eyebrow>Покажи другому участнику</Eyebrow>
        <QrPlaceholder size={168} />
        <p className="mt-3 text-[13px] text-mute">Обновится через 22 с · скриншот не сработает</p>
      </Card>
      <div className="mt-3">
        <Button href="/meet/scan">
          <Icon name="qr" className="size-5" />
          Сканировать код другого
        </Button>
      </div>

      <SectionTitle>Пара месяца</SectionTitle>
      <Card>
        <Eyebrow>Бот свёл вас</Eyebrow>
        <h3 className="text-[19px] font-bold">{person(26)} · Дизайн и digital</h3>
        <p className="mb-4 mt-2 text-[14px] text-mute">Вы ещё не знакомы. Новая связь в месяц — закон №2.</p>
        <Button href="/meet/request" variant="outline">
          Договориться о встрече
        </Button>
      </Card>

      <SectionTitle>Живая встреча клуба</SectionTitle>
      <Card>
        <Eyebrow>Сб 18 окт · 17:00 · Фрайбург</Eyebrow>
        <p className="mb-4 text-[14.5px] leading-snug text-mute">Спорт и «круг запросов»: каждый называет один запрос и одно предложение.</p>
        <Button variant="outline">Записаться</Button>
      </Card>
    </>
  );
}

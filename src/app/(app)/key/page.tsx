import { QrPlaceholder } from "@/components/club/QrPlaceholder";
import { BackLink } from "@/components/shell/BackLink";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import { me } from "@/lib/mock";

/** Ключ-карта: большой QR для встреч */
export default function KeyPage() {
  return (
    <>
      <BackLink />
      <PageHeader title={`Ключ-карта №${String(me.number).padStart(2, "0")}`} lead="Покажи другому участнику. Встреча засчитается, когда вы оба покажете коды друг другу." />
      <Card className="text-center">
        <Eyebrow>Живой код · обновляется каждые 30 секунд</Eyebrow>
        <QrPlaceholder size={210} />
        <div className="mt-4 h-1 w-56 mx-auto overflow-hidden rounded-full bg-line">
          <div className="h-full w-3/4 rounded-full bg-accent" />
        </div>
        <p className="mt-2 text-[13px] text-mute">Обновится через 22 с · скриншот не сработает</p>
      </Card>
      <div className="mt-4 space-y-3">
        <Button href="/meet/scan">Сканировать код другого</Button>
        <Button href="/meet" variant="outline">В зал встреч</Button>
      </div>
    </>
  );
}

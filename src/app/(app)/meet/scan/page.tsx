import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";

/** Сканер QR. Камера подключится позже, сейчас — рамка-заглушка */
export default function ScanPage() {
  return (
    <>
      <BackLink href="/meet">Зал встреч</BackLink>
      <PageHeader title="Сканер" lead="Наведи камеру на QR другого участника." />
      <div className="relative mb-6 grid aspect-square place-items-center overflow-hidden rounded-3xl border border-line bg-field">
        <span className="absolute left-6 top-6 size-10 rounded-tl-2xl border-l-[3px] border-t-[3px] border-accent" />
        <span className="absolute right-6 top-6 size-10 rounded-tr-2xl border-r-[3px] border-t-[3px] border-accent" />
        <span className="absolute bottom-6 left-6 size-10 rounded-bl-2xl border-b-[3px] border-l-[3px] border-accent" />
        <span className="absolute bottom-6 right-6 size-10 rounded-br-2xl border-b-[3px] border-r-[3px] border-accent" />
        <span className="px-16 text-center text-[14px] text-mute">Здесь будет камера</span>
      </div>
      <Button href="/meet/scanned">Имитировать скан участника</Button>
      <p className="mt-4 text-center text-[13px] text-mute">Баллы за встречу: первая с человеком — полные, повторные — меньше, потом ноль.</p>
    </>
  );
}

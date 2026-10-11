import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { me } from "@/lib/mock";

/** Ключ-карта участника: номер, имя, кнопка QR */
export function KeyCard() {
  return (
    <Link href="/key" className="block rounded-2xl bg-accent p-5 text-ink">
      <div className="flex justify-between text-[10px] font-extrabold tracking-[0.2em]">
        <span>КЛЮЧ-КАРТА</span>
        <span>{me.role.toUpperCase()}</span>
      </div>
      <div className="my-4 text-[64px] font-extrabold leading-none tracking-tight">
        <small className="mr-1 text-[20px] font-bold">№</small>
        {String(me.number).padStart(2, "0")}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-[13px] font-extrabold">
          {me.name.toUpperCase()}
          <small className="mt-0.5 block text-[12px] font-semibold opacity-85">
            {me.level} · Пульс {me.pulse}
          </small>
        </div>
        <span className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2.5 text-[12.5px] font-bold text-accent">
          <Icon name="qr" className="size-[18px]" />
          Показать QR
        </span>
      </div>
    </Link>
  );
}

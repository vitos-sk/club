import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/** Карта участника: номер, имя, статус, Пульс. Ведёт в кабинет. */
export function KeyCard({
  number,
  name,
  role,
  level,
  pulse,
}: {
  number: number | null;
  name: string;
  role: string;
  level: string;
  pulse: number | null;
}) {
  return (
    <Link href="/study" className="block rounded-2xl bg-accent p-5 text-ink">
      <div className="flex justify-between text-[10px] font-extrabold tracking-[0.2em]">
        <span>КАРТА УЧАСТНИКА</span>
        <span>{role.toUpperCase()}</span>
      </div>
      <div className="my-4 text-[64px] font-extrabold leading-none tracking-tight">
        <small className="mr-1 text-[20px] font-bold">№</small>
        {number != null ? String(number).padStart(2, "0") : "—"}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-[13px] font-extrabold">
          {name.toUpperCase()}
          <small className="mt-0.5 block text-[12px] font-semibold opacity-85">
            {level}
            {pulse != null ? ` · Пульс ${pulse}` : ""}
          </small>
        </div>
        <span className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2.5 text-[12.5px] font-bold text-accent">
          <Icon name="user" className="size-[18px]" />
          Кабинет
        </span>
      </div>
    </Link>
  );
}

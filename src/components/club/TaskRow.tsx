import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function TaskRow({
  title,
  sub,
  href,
  cta,
  done,
}: {
  title: string;
  sub: string;
  href: string;
  cta: string;
  done?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
      <span
        className={cn(
          "grid size-[22px] shrink-0 rotate-45 scale-[.8] place-items-center border-[1.5px]",
          done ? "border-accent bg-accent text-ink" : "border-accent-2",
        )}
      >
        {done && <Icon name="check" className="size-[13px] -rotate-45 stroke-[3]" />}
      </span>
      <span className={cn("min-w-0 flex-1", done && "opacity-50")}>
        <span className={cn("block text-[16px] font-bold leading-snug", done && "line-through")}>{title}</span>
        <span className="mt-0.5 block text-[13px] text-mute">{done ? "Готово" : sub}</span>
      </span>
      {!done && (
        <span className="rounded-md border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          {cta}
        </span>
      )}
    </Link>
  );
}

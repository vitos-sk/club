import Link from "next/link";
import { cn } from "@/lib/cn";

export function Segmented({ items }: { items: Array<{ href: string; label: string; active?: boolean }> }) {
  return (
    <div className="mb-6 flex gap-6 border-b border-line text-[12px] font-bold uppercase tracking-[0.14em]">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            "-mb-px border-b-2 py-3",
            it.active ? "border-accent text-accent" : "border-transparent text-mute",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

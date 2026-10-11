"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Нижнее меню: Холл · Доска · Кабинет */
export function BottomNav() {
  const pathname = usePathname();
  const inStudy = pathname.startsWith("/study");
  const inBoard = pathname.startsWith("/board");
  const inHall = !inStudy && !inBoard;

  return (
    <nav className="relative z-10 grid h-[78px] shrink-0 grid-cols-[1fr_84px_1fr] items-center border-t border-line bg-nav">
      <Link href="/" className={cn("flex flex-col items-center gap-1 text-[11px] font-bold", inHall ? "text-accent" : "text-mute")}>
        <Icon name="home" />
        Холл
      </Link>
      <Link
        href="/board"
        aria-label="Доска запросов"
        className="mx-auto -mt-6 grid size-16 place-items-center rounded-full bg-accent text-ink shadow-[0_8px_22px_rgb(0_0_0/.6),0_0_0_5px_var(--color-nav)]"
      >
        <Icon name="board" className="size-7" />
      </Link>
      <Link href="/study" className={cn("flex flex-col items-center gap-1 text-[11px] font-bold", inStudy ? "text-accent" : "text-mute")}>
        <Icon name="user" />
        Кабинет
      </Link>
    </nav>
  );
}

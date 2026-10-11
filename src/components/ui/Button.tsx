import Link from "next/link";
import { cn } from "@/lib/cn";

type Props = {
  href?: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "sm";
  className?: string;
  children: React.ReactNode;
};

/** Кнопка. С href — это ссылка (навигация макета), без href — заглушка без действия. */
export function Button({ href, variant = "primary", size = "md", className, children }: Props) {
  const cls = cn(
    "inline-flex w-full items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[.985]",
    size === "md" ? "px-5 py-4 text-[15.5px]" : "w-auto px-4 py-2.5 text-[13.5px]",
    variant === "primary" && "bg-accent text-ink",
    variant === "outline" && "border border-line text-fg",
    variant === "ghost" && "text-mute",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls}>
      {children}
    </button>
  );
}

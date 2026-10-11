import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  highlight,
}: {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        highlight ? "border-accent/70" : "border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Маленькая подпись над заголовком карточки */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-mute", className)}>
      {children}
    </div>
  );
}

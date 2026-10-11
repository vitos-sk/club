import { cn } from "@/lib/cn";

export function Chip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3.5 py-2 text-[13.5px] font-semibold",
        active ? "border-accent bg-accent text-ink" : "border-line text-mute",
      )}
    >
      {children}
    </span>
  );
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

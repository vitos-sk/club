import { cn } from "@/lib/cn";

const base =
  "w-full rounded-xl border border-line-strong bg-field px-4 py-3.5 text-[16px] text-fg placeholder:text-mute outline-none focus:border-accent";

/** Поле ввода. Пока без логики: просто нарисованное. */
export function Field({
  label,
  multiline,
  placeholder,
  className,
}: {
  label?: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-2 block text-[12px] font-bold uppercase tracking-[0.12em] text-mute">{label}</span>}
      {multiline ? (
        <textarea rows={4} placeholder={placeholder} className={cn(base, "min-h-28 resize-none leading-snug")} />
      ) : (
        <input type="text" placeholder={placeholder} className={base} />
      )}
    </label>
  );
}

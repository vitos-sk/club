import { cn } from "@/lib/cn";

export interface Option {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Выбор «фишками» без JavaScript: скрытые radio/checkbox и стили через peer-checked.
 * Работает в серверных компонентах и внутри форм серверных действий.
 */
export function ChoiceGroup({
  name,
  options,
  defaultValue,
  type = "radio",
  required,
  label,
  className,
}: {
  name: string;
  options: Option[];
  defaultValue?: string | string[];
  type?: "radio" | "checkbox";
  required?: boolean;
  label?: string;
  className?: string;
}) {
  const def = Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : [];
  return (
    <fieldset className={cn("min-w-0", className)}>
      {label && <legend className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">{label}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={cn("relative", o.disabled && "opacity-40")}>
            <input
              type={type}
              name={name}
              value={o.value}
              defaultChecked={def.includes(o.value)}
              disabled={o.disabled}
              required={required && type === "radio"}
              className="peer sr-only"
            />
            <span className="inline-flex cursor-pointer items-center rounded-full border border-line px-3.5 py-2 text-[13.5px] font-semibold text-mute transition peer-checked:border-accent peer-checked:bg-accent peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {o.label}
            </span>
            {o.hint && <span className="sr-only">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Переключатель «да / нет» (чекбокс в виде тумблера). */
export function Toggle({
  name,
  title,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  title: string;
  hint?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-4 border-y border-line py-4", disabled && "opacity-50")}>
      <span className="flex-1">
        <b className="block text-[16px]">{title}</b>
        {hint && <span className="text-[13px] text-mute">{hint}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-mute after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-ink" />
    </label>
  );
}

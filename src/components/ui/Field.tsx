import { cn } from "@/lib/cn";

const base =
  "w-full rounded-xl border border-line-strong bg-field px-4 py-3.5 text-[16px] text-fg placeholder:text-mute outline-none focus:border-accent";

const labelCls = "mb-2 block text-[12px] font-bold uppercase tracking-[0.12em] text-mute";

/** Поле ввода: однострочное или многострочное. Имя `name` нужно, чтобы значение попало в серверное действие. */
export function Field({
  label,
  multiline,
  placeholder,
  className,
  name,
  defaultValue,
  required,
  type = "text",
  maxLength,
  rows = 4,
  hint,
}: {
  label?: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  name?: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: "text" | "number" | "date" | "datetime-local" | "time";
  maxLength?: number;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && <span className={labelCls}>{label}</span>}
      {multiline ? (
        <textarea
          name={name}
          rows={rows}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          className={cn(base, "min-h-28 resize-none leading-snug")}
        />
      ) : (
        <input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} maxLength={maxLength} className={base} />
      )}
      {hint && <span className="mt-2 block text-[12.5px] text-mute">{hint}</span>}
    </label>
  );
}

/** Выпадающий список (обычный select в стиле полей). */
export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  className,
  placeholder,
}: {
  label?: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && <span className={labelCls}>{label}</span>}
      <select name={name} defaultValue={defaultValue ?? ""} required={required} className={cn(base, "appearance-none")}>
        {(placeholder !== undefined || !defaultValue) && (
          <option value="" disabled={required}>
            {placeholder ?? "— выбери —"}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

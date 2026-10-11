"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface ActionState {
  error?: string;
  ok?: string;
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Форма с серверным действием: показывает ошибку из правил клуба и сообщение об успехе. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-[14px] font-semibold leading-snug text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-4 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold leading-snug text-ok">
          {state.ok}
        </p>
      )}
    </form>
  );
}

/** Кнопка отправки: блокируется, пока действие выполняется. */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  formAction,
}: {
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "sm";
  className?: string;
  formAction?: Action;
}) {
  const { pending } = useFormStatus();
  const cls = cn(
    "inline-flex w-full items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[.985] disabled:opacity-60",
    size === "md" ? "px-5 py-4 text-[15.5px]" : "w-auto px-4 py-2.5 text-[13.5px]",
    variant === "primary" && "bg-accent text-ink",
    variant === "outline" && "border border-line text-fg",
    variant === "ghost" && "text-mute",
    className,
  );
  return (
    <button
      type="submit"
      disabled={pending}
      className={cls}
      {...(formAction ? { formAction: formAction as unknown as (fd: FormData) => void } : {})}
    >
      {pending ? "Минутку…" : children}
    </button>
  );
}

// Reference to avoid tree-shaking confusion: Button is re-exported for forms that need a link-style button.
export { Button };

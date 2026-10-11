"use client";

import { useActionState } from "react";
import { gateAction, type GateState } from "./actions";

export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<GateState, FormData>(gateAction, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-2 block text-[12px] font-bold uppercase tracking-[0.12em] text-mute">Пароль</span>
        <input
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          className="w-full rounded-xl border border-line-strong bg-field px-4 py-3.5 text-[16px] text-fg outline-none focus:border-accent"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-[14px] font-semibold text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-5 py-4 text-[15.5px] font-bold text-ink disabled:opacity-60">
        {pending ? "Проверяю…" : "Войти"}
      </button>
    </form>
  );
}

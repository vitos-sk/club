import { BottomNav } from "./BottomNav";

/**
 * Каркас экрана Mini App: вертикальная колонка шириной с телефон.
 * На телефоне занимает весь экран, на компьютере стоит по центру на всю высоту окна, без рамки.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg md:border-x md:border-line">
      <main className="scroll-clean min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-7">{children}</main>
      <BottomNav />
    </div>
  );
}

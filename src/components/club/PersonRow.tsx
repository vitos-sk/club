import { person } from "@/lib/mock";

export function PersonRow({ n, title, sub, action }: { n: number; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-b border-line py-4 last:border-b-0">
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card-2 text-[13px] font-extrabold text-accent">
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] font-bold leading-snug">
          {person(n)} · {title}
        </div>
        <div className="mt-0.5 text-[13px] leading-snug text-mute">{sub}</div>
      </div>
      {action}
    </div>
  );
}

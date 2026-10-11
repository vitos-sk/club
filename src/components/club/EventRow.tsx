export function EventRow({ day, dow, title, sub }: { day: string; dow: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
      <div className="w-[52px] text-center">
        <b className="block text-[30px] font-extrabold leading-none text-accent">{day}</b>
        <span className="text-[10px] font-bold tracking-[0.14em] text-mute">{dow}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-bold leading-snug">{title}</div>
        <div className="mt-0.5 text-[13px] text-mute">{sub}</div>
      </div>
    </div>
  );
}

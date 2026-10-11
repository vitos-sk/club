export function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="my-4">
      <div className="mb-2 flex justify-between text-[14px] font-semibold">
        <span>{label}</span>
        <b className="font-bold text-accent">
          {value} / {max}
        </b>
      </div>
      <div className="h-1.5 rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: string }) {
  return (
    <div className="mb-3.5 mt-9 flex items-center gap-3.5">
      <h2 className="text-[20px] font-bold tracking-tight">{children}</h2>
      <span className="h-px flex-1 bg-line" />
      {aside && <span className="text-[12.5px] font-semibold text-mute">{aside}</span>}
    </div>
  );
}

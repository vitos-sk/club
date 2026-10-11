export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="mb-7">
      <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight">{title}</h1>
      {lead && <p className="mt-2.5 text-[15.5px] leading-snug text-mute">{lead}</p>}
    </header>
  );
}

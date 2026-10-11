/** Табличка клуба: NEXT / ЗАКРЫТЫЙ КЛУБ */
export function Plaque() {
  return (
    <div className="text-center">
      <div className="pl-[0.34em] text-[30px] font-extrabold tracking-[0.34em]">NEXT</div>
      <div className="mt-1.5 flex items-center justify-center gap-2.5 text-[10px] font-semibold tracking-[0.24em] text-mute">
        <i className="h-px w-8 bg-accent-2/60" />
        ЗАКРЫТЫЙ КЛУБ
        <i className="h-px w-8 bg-accent-2/60" />
      </div>
    </div>
  );
}

/** Шкала Пульса: полукруг со значением */
export function Gauge({ value }: { value: number }) {
  const len = 314;
  return (
    <svg viewBox="0 0 250 150" className="mx-auto my-2 block w-[260px]" role="img" aria-label={`Пульс ${value}`}>
      <path d="M25 125 A100 100 0 0 1 225 125" fill="none" stroke="var(--color-line)" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M25 125 A100 100 0 0 1 225 125"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - value / 100)}
      />
      <text x="125" y="112" textAnchor="middle" className="fill-accent text-[46px] font-extrabold">
        {value}
      </text>
      <text x="125" y="140" textAnchor="middle" className="fill-mute text-[10px] font-bold" letterSpacing="2">
        ПУЛЬС · АКТИВНОСТЬ В КЛУБЕ
      </text>
    </svg>
  );
}

import { PersonRow } from "@/components/club/PersonRow";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/SectionTitle";

const known = [12, 4, 9, 3, 15, 18, 21, 35];
const unknown = [26, 31, 33, 40];

function pos(i: number, n: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [165 + Math.cos(a) * r, 135 + Math.sin(a) * r * 0.92] as const;
}

/** Карта связей: кого ты знаешь, а кого ещё нет */
export default function ConnectionsPage() {
  const all = [...known, ...unknown];
  return (
    <>
      <BackLink href="/study">Кабинет</BackLink>
      <PageHeader title="Карта связей" lead={`Ты знаком с ${known.length}, ещё ${unknown.length} ждут знакомства.`} />
      <svg viewBox="0 0 330 270" className="mx-auto block w-full" role="img" aria-label="Карта связей">
        {all.map((n, i) => {
          const [x, y] = pos(i, all.length, 105);
          const k = known.includes(n);
          return <line key={`l${n}`} x1="165" y1="135" x2={x} y2={y} stroke={k ? "var(--color-line-strong)" : "var(--color-line)"} strokeDasharray={k ? undefined : "3 4"} />;
        })}
        <circle cx="165" cy="135" r="24" fill="var(--color-accent)" />
        <text x="165" y="140" textAnchor="middle" className="fill-ink text-[13px] font-extrabold">
          07
        </text>
        {all.map((n, i) => {
          const [x, y] = pos(i, all.length, 105);
          const k = known.includes(n);
          return (
            <g key={n}>
              <circle cx={x} cy={y} r="17" fill="var(--color-card)" stroke={k ? "var(--color-accent)" : "var(--color-line-strong)"} strokeDasharray={k ? undefined : "3 3"} />
              <text x={x} y={y + 3.5} textAnchor="middle" className={k ? "fill-fg text-[10px] font-bold" : "fill-mute text-[10px] font-bold"}>
                {String(n).padStart(2, "0")}
              </text>
            </g>
          );
        })}
      </svg>

      <SectionTitle>Ещё не знакомы</SectionTitle>
      {unknown.slice(0, 2).map((n) => (
        <PersonRow
          key={n}
          n={n}
          title="Участник"
          sub="Вы ещё не знакомы"
          action={
            <Button href="/meet/request" size="sm" variant="outline">
              Предложить
            </Button>
          }
        />
      ))}
    </>
  );
}

import Link from "next/link";
import { Gauge } from "@/components/club/Gauge";
import { BackLink } from "@/components/shell/BackLink";
import { Bar } from "@/components/ui/Bar";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { letters, me, person } from "@/lib/mock";

const links: Array<{ href: string; icon: IconName; title: string; sub: string }> = [
  { href: "/study/connections", icon: "users", title: "Карта связей", sub: "С кем ты знаком и с кем ещё нет" },
  { href: "/study/benefits", icon: "key", title: "Что даёт клуб", sub: "Люди, помощь, знания, возможности, рост" },
  { href: "/study/rules", icon: "scale", title: "Десять законов", sub: "Устав клуба" },
  { href: "/study/pause", icon: "clock", title: "Пауза", sub: "До 3 месяцев раз в год. Пульс не тает" },
];

/** Кабинет: профиль, фокус недели, Пульс, ключи, письма */
export default function StudyPage() {
  return (
    <>
      <BackLink />
      <div className="mx-auto mb-6 w-max max-w-full rounded-xl bg-accent px-6 py-3 text-center text-ink">
        <b className="block text-[21px] font-extrabold tracking-wide">
          № {String(me.number).padStart(2, "0")} · {me.name.toUpperCase()}
        </b>
        <span className="text-[10px] font-extrabold tracking-[0.22em]">
          {me.role.toUpperCase()} · {me.city.toUpperCase()}
        </span>
      </div>

      <Card highlight>
        <Eyebrow>Фокус недели</Eyebrow>
        <h3 className="text-[22px] font-extrabold">Не задан</h3>
        <p className="mb-4 mt-1.5 text-[14px] text-mute">Одно главное действие на неделю. Закон №1.</p>
        <Button href="/study/focus">Задать фокус</Button>
      </Card>

      <div className="mt-5">
        <Gauge value={me.pulse} />
      </div>
      <Bar label="Движение" value={20} max={25} />
      <Bar label="Связи" value={21} max={30} />
      <Bar label="Помощь другим" value={33} max={45} />

      <SectionTitle>Ключи доступа</SectionTitle>
      <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-bold">
        {[
          ["Кандидат", true],
          ["Участник", true],
          ["Партнёр", false],
          ["Совет", false],
        ].map(([t, on]) => (
          <div key={String(t)} className={on ? "rounded-xl border border-accent/60 bg-card py-3 text-fg" : "rounded-xl border border-line py-3 text-mute"}>
            <Icon name={on ? "key" : "lock"} className="mx-auto mb-1.5 size-6" />
            {t}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-mute">
        До «Партнёра»: Пульс 80 (сейчас {me.pulse}) и серьёзная помощь 2 из 3. Партнёр голосует при отборе и поручается за новичков.
      </p>

      <SectionTitle>Письма благодарности</SectionTitle>
      {letters.map((l) => (
        <Card key={l.text} className="mb-3">
          <p className="text-[16px] font-medium italic leading-snug">«{l.text}»</p>
          <div className="mt-3 text-[12.5px] font-semibold text-mute">
            от {person(l.from)} · {l.rate}
          </div>
        </Card>
      ))}

      <SectionTitle>Клуб</SectionTitle>
      <Card className="py-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-4 border-b border-line py-4 last:border-b-0">
            <Icon name={l.icon} className="text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold">{l.title}</span>
              <span className="text-[12.5px] text-mute">{l.sub}</span>
            </span>
            <Icon name="chev" className="size-[18px] text-mute" />
          </Link>
        ))}
        <div className="flex items-center gap-4 py-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-bold text-warn">Выйти из клуба</span>
            <span className="text-[12.5px] text-mute">В один шаг, личные данные удаляются</span>
          </span>
        </div>
      </Card>
    </>
  );
}

import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { rhythm } from "@/lib/mock";

/** Каминная: горячий стул и ритм клуба */
export default function FireplacePage() {
  return (
    <>
      <BackLink />
      <PageHeader title="Каминная" lead="Здесь греются у огня и сверяют ритм клуба." />
      <Card highlight>
        <Eyebrow>Четверг · 19:00 · онлайн</Eyebrow>
        <h3 className="text-[22px] font-extrabold">Горячий стул</h3>
        <p className="mb-5 mt-2 text-[14.5px] leading-snug text-mute">
          Один участник выносит свою ситуацию, остальные 45 минут дают решения и контакты. Участие по желанию.
        </p>
        <Button>Напомнить мне</Button>
      </Card>

      <SectionTitle>Ритм клуба</SectionTitle>
      <Card className="py-1">
        {rhythm.map((r) => (
          <div key={r.when} className="flex gap-4 border-b border-line py-4 last:border-b-0">
            <b className="w-[78px] shrink-0 pt-0.5 text-[11px] font-extrabold uppercase leading-snug tracking-[0.1em] text-accent">{r.when}</b>
            <div>
              <div className="text-[15.5px] font-bold leading-snug">{r.title}</div>
              <div className="mt-0.5 text-[13px] text-mute">{r.sub}</div>
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-[13px] text-mute">
        <Icon name="key" className="size-4" />
        Обязательны только законы: шаг в неделю, новая связь и помощь в месяц. Всё остальное — по желанию.
      </div>
    </>
  );
}

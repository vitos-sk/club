import Link from "next/link";
import { getPulseFor } from "@core/access";
import { publicDecisionText } from "@core/council";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Bar } from "@/components/ui/Bar";
import { Button } from "@/components/ui/Button";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDay, fmtDayTime } from "@/lib/format";
import { requireInside } from "@/server/club";

/** Совет. Участнику показывается, что нужно для доступа; Совету и создателю — рабочие списки. */
export default async function CouncilPage() {
  const v = await requireInside();
  const { store, now, member } = v;
  const cfg = await store.getConfig();

  if (!v.staff) {
    const p = await getPulseFor(store, now, member.id, member.id);
    return (
      <>
        <BackLink />
        <PageHeader title="Совет" lead="Комната для Партнёров и выше. Следующий ключ — «Партнёр»." />
        <Card>
          <Eyebrow>Что нужно для доступа</Eyebrow>
          <Bar label="Пульс" value={Math.min(p.value, cfg.partner_threshold)} max={cfg.partner_threshold} />
          <p className="text-[13px] text-mute">Плюс доказательства, которые проверяет Совет. Приложение только показывает порог — повышает человек.</p>
        </Card>
        <SectionTitle>Что внутри</SectionTitle>
        <Card className="py-1">
          {["Приём кандидатов, исключение, деньги фонда", "Журнал: пропущенные встречи, остановившиеся, срок первой помощи", "Решения публикуются с причиной", "Любое решение обжалуется голосованием всех участников"].map((t) => (
            <div key={t} className="flex items-center gap-3.5 border-b border-line py-4 text-[15px] last:border-b-0">
              <Icon name="lock" className="size-[18px] text-mute" />
              {t}
            </div>
          ))}
        </Card>
      </>
    );
  }

  const members = new Map((await store.t.members.list()).map((m) => [m.id, m]));
  const journal = (await store.t.council_journal.list()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 15);
  const decisions = (await store.t.council_decisions.list()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10);
  const terms = await store.t.council_terms.list();
  const active = [...members.values()].filter((m) => ["member", "partner", "council"].includes(m.status));
  const pulses = await Promise.all(active.map(async (m) => ({ m, p: await getPulseFor(store, now, member.id, m.id) })));
  const partnerReady = pulses.filter((x) => x.p.value >= cfg.partner_threshold && x.m.status === "member");
  const councilReady = pulses.filter((x) => x.p.value >= cfg.council_threshold && x.m.status === "partner");

  return (
    <>
      <BackLink />
      <PageHeader title="Совет" lead="Рабочая комната. Решения публикуются с причиной и без личных деталей." />
      <div className="mb-2 space-y-3">
        <Button href="/staff">Штаб: приём, события, отчёт</Button>
      </div>

      <SectionTitle>Прошли порог</SectionTitle>
      <Card>
        <Eyebrow>Партнёр: Пульс от {cfg.partner_threshold} + доказательства</Eyebrow>
        {partnerReady.length === 0 ? (
          <p className="text-[14px] text-mute">Пока никого.</p>
        ) : (
          partnerReady.map((x) => (
            <div key={x.m.id} className="py-1.5 text-[15px] font-semibold">
              {memberLabel(x.m)} · {x.p.value}
            </div>
          ))
        )}
        <Eyebrow className="mt-4">Совет: Пульс от {cfg.council_threshold} + доказательства + решение</Eyebrow>
        {councilReady.length === 0 ? (
          <p className="text-[14px] text-mute">Пока никого.</p>
        ) : (
          councilReady.map((x) => (
            <div key={x.m.id} className="py-1.5 text-[15px] font-semibold">
              {memberLabel(x.m)} · {x.p.value}
            </div>
          ))
        )}
        <p className="mt-3 text-[12.5px] text-mute">Приложение только показывает, кто прошёл порог. Повышает человек.</p>
      </Card>

      <SectionTitle>Журнал для Совета</SectionTitle>
      {journal.length === 0 && <p className="text-[14.5px] text-mute">Записей нет.</p>}
      {journal.map((j) => (
        <Card key={j.id} className="mb-3">
          <Eyebrow>
            {fmtDayTime(j.created_at)} · {j.kind}
          </Eyebrow>
          <div className="text-[14.5px] font-semibold">{j.member_id ? memberLabel(members.get(j.member_id)) : ""}</div>
          <p className="mt-1 text-[14px] leading-snug text-mute">{j.note}</p>
        </Card>
      ))}

      <SectionTitle>Публичные решения</SectionTitle>
      {decisions.length === 0 && <p className="text-[14.5px] text-mute">Решений пока нет.</p>}
      {decisions.map((d) => (
        <Card key={d.id} className="mb-3">
          <Eyebrow>
            {fmtDay(d.created_at)} · решил(а): {memberLabel(members.get(d.decided_by))}
          </Eyebrow>
          <p className="text-[14.5px] leading-snug">{publicDecisionText(d, d.subject_id ? members.get(d.subject_id) : null)}</p>
          <p className="mt-2 text-[11.5px] text-mute">Так текст уйдёт в канал «Новости NEXT», когда подключим бота.</p>
        </Card>
      ))}

      <SectionTitle>Сроки в Совете</SectionTitle>
      {terms.map((t) => (
        <div key={t.id} className="flex justify-between border-b border-line py-3 text-[14.5px] last:border-b-0">
          <span className="font-semibold">{memberLabel(members.get(t.member_id))}</span>
          <span className="text-mute">
            срок {t.term_no} · до {fmtDay(t.ends_on)}
          </span>
        </div>
      ))}
      <p className="mt-6 text-center text-[12px] text-mute">
        <Link href="/dev" className="underline">
          Тестовая панель
        </Link>
      </p>
    </>
  );
}

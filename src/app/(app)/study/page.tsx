import Link from "next/link";
import { getPublicHelpHistory, getPulseFor } from "@core/access";
import { creditBalance } from "@core/credits";
import { memberLabel } from "@core/members";
import { isOnline } from "@core/pulse";
import { Gauge } from "@/components/club/Gauge";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { BackLink } from "@/components/shell/BackLink";
import { Bar } from "@/components/ui/Bar";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDay, STATUS_LABEL } from "@/lib/format";
import { leaveClubAction } from "@/app/actions";
import { requireInside } from "@/server/club";

const links: Array<{ href: string; icon: IconName; title: string; sub: string }> = [
  { href: "/people", icon: "users", title: "Люди клуба", sub: "Кто есть в клубе, чем помогает" },
  { href: "/inbox", icon: "telegram", title: "Входящие", sub: "Сообщения от клуба и бота" },
  { href: "/study/benefits", icon: "key", title: "Что даёт клуб", sub: "Люди, помощь, знания, возможности, рост" },
  { href: "/study/rules", icon: "scale", title: "Десять законов", sub: "Устав клуба" },
];

/** Кабинет: профиль, Пульс, кредиты, письма благодарности */
export default async function StudyPage() {
  const v = await requireInside();
  const { store, now, member } = v;
  const cfg = await store.getConfig();
  const pulse = await getPulseFor(store, now, member.id, member.id);
  const [helps, meetings, responses] = await Promise.all([store.t.helps.list(), store.t.meetings.list(), store.t.responses.list()]);
  const online = isOnline({ helps, meetings, responses }, member.id, now, cfg.active_window_days);
  const credits = await creditBalance(store, member.id);
  const letters = await getPublicHelpHistory(store, member.id, member.id);
  const fh = (await store.t.first_help.list({ member_id: member.id }))[0];
  const keys: Array<[string, boolean]> = [
    ["Кандидат", true],
    ["Участник", ["member", "partner", "council"].includes(member.status)],
    ["Партнёр", ["partner", "council"].includes(member.status)],
    ["Совет", member.status === "council"],
  ];
  const role = member.is_founder ? "Основатель" : STATUS_LABEL[member.status];

  return (
    <>
      <BackLink />
      <div className="mx-auto mb-6 w-max max-w-full rounded-xl bg-accent px-6 py-3 text-center text-ink">
        <b className="block text-[21px] font-extrabold tracking-wide">
          {member.number != null ? `№ ${String(member.number).padStart(2, "0")} · ` : ""}
          {(member.name ?? "бывший участник").toUpperCase()}
        </b>
        <span className="text-[10px] font-extrabold tracking-[0.22em]">
          {role.toUpperCase()} · ФРАЙБУРГ{member.is_creator ? " · СОЗДАТЕЛЬ" : ""}
        </span>
      </div>

      {member.status === "probation" && (
        <Card highlight className="mb-5">
          <Eyebrow>Испытательный месяц</Eyebrow>
          <p className="text-[15px] leading-snug">
            До {member.probation_until ? fmtDay(member.probation_until) : "конца месяца"}. Нужна хотя бы одна подтверждённая помощь другому участнику — иначе выход по умолчанию. Совет может отменить решение с причиной.
          </p>
        </Card>
      )}

      {fh && fh.status !== "helped" && (
        <Card className="mb-5">
          <Eyebrow>Гарантия первой помощи</Eyebrow>
          <h3 className="text-[17px] font-bold leading-snug">«{fh.main_request}»</h3>
          <p className="mt-2 text-[13.5px] text-mute">
            {fh.status === "pending" ? `Ты поговоришь с человеком, который ближе всего к этой задаче${fh.talk_deadline ? ` — до ${fmtDay(fh.talk_deadline)}` : ""}.` : fh.status === "talked" ? "Разговор состоялся." : "Решения ни у кого нет — мы сказали прямо и дали то, что есть."}
          </p>
        </Card>
      )}

      <div className="mt-5">
        <Gauge value={pulse.value} />
      </div>
      <p className="text-center text-[12.5px] text-mute">Свой Пульс видишь только ты и Совет. Остальные видят твой статус и отзывы.</p>
      <Bar label="Вклад (помощь другим)" value={Math.round(75 * pulse.contribution)} max={75} />
      <Bar label="Связи (новые знакомства за 6 месяцев)" value={Math.round(25 * pulse.connections)} max={25} />
      <div className="my-4 flex items-center justify-between text-[14px] font-semibold">
        <span>Движение</span>
        <b className={online ? "text-ok" : "text-warn"}>{online ? "на связи" : "тихо за 30 дней"}</b>
      </div>

      <SectionTitle aside={`${credits.unspent} из ${cfg.credits_max}`}>Кредиты на встречи</SectionTitle>
      <p className="text-[13.5px] leading-snug text-mute">Свободно: {credits.available}, в резерве: {credits.reserved}. Каждая подтверждённая помощь даёт кредит; больше {cfg.credits_max} не копится.</p>

      <SectionTitle>Ключи доступа</SectionTitle>
      <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-bold">
        {keys.map(([t, on]) => (
          <div key={t} className={on ? "rounded-xl border border-accent/60 bg-card py-3 text-fg" : "rounded-xl border border-line py-3 text-mute"}>
            <Icon name={on ? "key" : "lock"} className="mx-auto mb-1.5 size-6" />
            {t}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-mute">
        Партнёр: Пульс от {cfg.partner_threshold} плюс доказательства, которые проверяет Совет{pulse.value >= cfg.partner_threshold ? " — порог ты прошёл(ла)" : ` (сейчас ${pulse.value})`}. Совет: от {cfg.council_threshold}, доказательства и решение Совета{pulse.value >= cfg.council_threshold ? " — порог пройден" : ""}. Приложение только показывает порог: повышает людей человек.
      </p>

      <SectionTitle>Письма благодарности</SectionTitle>
      {letters.length === 0 && <p className="text-[14.5px] text-mute">Пока нет. Первая подтверждённая помощь появится здесь с отзывом.</p>}
      {letters.slice(0, 6).map((l) => (
        <Card key={l.help_id} className="mb-3">
          <p className="text-[16px] font-medium italic leading-snug">«{l.review}»</p>
          <div className="mt-3 text-[12.5px] font-semibold text-mute">от {l.receiver} · {fmtDay(l.at)}</div>
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
      </Card>

      <SectionTitle>Выйти из клуба</SectionTitle>
      <Card>
        <p className="mb-4 text-[13.5px] leading-snug text-mute">Личные данные удалятся. Записи о помощи останутся под подписью «бывший участник», чтобы не ломать Пульс других. Закроются твои записка, предложение и открытые запросы встреч.</p>
        <ActionForm action={leaveClubAction}>
          <Field name="confirm" label="Чтобы подтвердить, напиши: выйти" placeholder="выйти" />
          <div className="mt-4">
            <SubmitButton variant="outline">Выйти из клуба</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-[11.5px] text-mute">{memberLabel(member)}</p>
    </>
  );
}

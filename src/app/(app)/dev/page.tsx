import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, Eyebrow } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDayTime, STATUS_LABEL } from "@/lib/format";
import { advanceTimeAction, resetClockAction, resetDataAction, runTickAction, switchPersonaAction } from "@/app/actions";
import { getViewer, listPersonas } from "@/server/club";

/**
 * Тестовая панель. Работает только в режиме заглушек.
 * TODO(auth): убрать, когда вход пойдёт через подпись Telegram (этап B) — переключение пользователей небезопасно.
 */
export default async function DevPage({ searchParams }: { searchParams: Promise<{ moved?: string; created?: string; reset?: string }> }) {
  const v = await getViewer();
  const sp = await searchParams;
  const personas = await listPersonas(v.store);
  const group = (title: string, pick: (p: (typeof personas)[number]) => boolean) => ({ title, items: personas.filter(pick) });
  const groups = [
    group("Создатель и Совет", (p) => !!p.member && (p.member.is_creator || p.member.status === "council")),
    group("Участники и Партнёр", (p) => !!p.member && ["member", "partner", "stopped", "paused"].includes(p.member.status)),
    group("Испытательный месяц", (p) => p.member?.status === "probation"),
    group("Кандидаты и гости", (p) => !p.member || p.member.status === "candidate"),
    group("Вышедшие", (p) => !!p.member && ["left", "expelled"].includes(p.member.status)),
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <BackLink />
      <PageHeader title="Тест" lead="Заглушки без базы данных. Здесь переключаешься между людьми и двигаешь время, чтобы проверить сроки." />

      {sp.moved && <p role="status" className="mb-4 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Время сдвинуто на {sp.moved} дн. Плановые задачи выполнены, новых сообщений: {sp.created ?? 0}.</p>}
      {sp.created && !sp.moved && <p role="status" className="mb-4 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Плановые задачи выполнены, новых сообщений: {sp.created}.</p>}
      {sp.reset && <p role="status" className="mb-4 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Данные сброшены к тестовым. Ты снова создатель.</p>}

      <Card highlight>
        <Eyebrow>Сейчас</Eyebrow>
        <b className="text-[20px]">{v.member ? `${v.member.number != null ? `№${v.member.number} ` : ""}${v.member.name}` : v.displayName}</b>
        <p className="mt-1 text-[13px] text-mute">{v.member ? STATUS_LABEL[v.member.status] : "не в клубе"}{v.staff ? " · создатель/Совет" : ""} · время в приложении: {fmtDayTime(v.now)}</p>
      </Card>

      <SectionTitle>Кто ты</SectionTitle>
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          <Eyebrow>{g.title}</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {g.items.map((p) => (
              <ActionForm key={p.tg_user_id} action={switchPersonaAction}>
                <input type="hidden" name="tg" value={p.tg_user_id} />
                <button
                  type="submit"
                  className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold ${p.tg_user_id === v.tg ? "border-accent bg-accent text-ink" : "border-line text-fg"}`}
                  title={p.note || (p.member ? STATUS_LABEL[p.member.status] : "")}
                >
                  {p.member?.number != null ? `№${p.member.number} ` : ""}
                  {p.name}
                </button>
              </ActionForm>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[12.5px] leading-snug text-mute">Алиса — гость события: может пройти кодовое слово «Движение». «Случайный человек» не гость — анкету ему не откроют. Кирилл уже отправил анкету: оценить её могут создатель и Марина.</p>

      <SectionTitle>Машина времени</SectionTitle>
      <Card>
        <p className="mb-4 text-[13.5px] leading-snug text-mute">Сроки в клубе — недели и месяцы. Сдвинь время вперёд, чтобы увидеть: просроченную встречу, конец испытательного месяца, месячный снимок Пульса, напоминания.</p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14, 31].map((d) => (
            <ActionForm key={d} action={advanceTimeAction}>
              <input type="hidden" name="days" value={d} />
              <SubmitButton variant="outline" size="sm">+{d} дн.</SubmitButton>
            </ActionForm>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionForm action={runTickAction}>
            <SubmitButton variant="outline" size="sm">Запустить плановые задачи</SubmitButton>
          </ActionForm>
          <ActionForm action={resetClockAction}>
            <SubmitButton variant="ghost" size="sm">Вернуть реальное время</SubmitButton>
          </ActionForm>
        </div>
      </Card>

      <SectionTitle>Данные</SectionTitle>
      <Card>
        <p className="mb-4 text-[13.5px] leading-snug text-mute">Данные лежат в файле на этом компьютере и переживают перезапуск. Сброс вернёт тестовых людей, помощь, запросы и время.</p>
        <ActionForm action={resetDataAction}>
          <SubmitButton variant="outline">Сбросить данные</SubmitButton>
        </ActionForm>
      </Card>

      <SectionTitle>Что проверить</SectionTitle>
      <Card className="text-[14px] leading-relaxed">
        <ol className="list-decimal space-y-2 pl-5">
          <li><b>Подтвердить помощь</b> (создатель): Доска → «Мне помогли». Помощнику растёт Пульс, приходит кредит.</li>
          <li><b>Запрос и отклики</b>: у Дмитрия запрос с откликом «помощь» и «заказ». Зайди за Дмитрия, выбери помощника — «заказ» Пульс не даст.</li>
          <li><b>Встречи</b>: у создателя входящий запрос от Анны по кредиту. Нажми «Встретились» за двоих (смени человека).</li>
          <li><b>Путь кандидата</b>: за Кирилла и создателя оцени анкету (/review) → штаб: звонок, принять, посвятить.</li>
          <li><b>Сроки</b>: сдвинь время на 7 дней — Лена З. без помощи выйдет; на 14 — просрочатся встречи.</li>
          <li><b>Отчёт</b>: Совет → Штаб → «Отчёт», выгрузки CSV.</li>
        </ol>
        <p className="mt-3 text-[12.5px] text-mute"><Link href="/review" className="underline">Проверка анкет</Link> · <Link href="/duty" className="underline">Дежурный</Link> · <Link href="/join" className="underline">Вход кандидата</Link> · <Link href="/staff" className="underline">Штаб</Link></p>
      </Card>
    </>
  );
}

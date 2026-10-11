import Link from "next/link";
import { computeMetrics, formatReport } from "@core/metrics";
import { memberLabel } from "@core/members";
import { monthKey, prevMonthKey } from "@core/time";
import { QUESTIONS } from "@core/application_text";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup, Toggle } from "@/components/forms/Choice";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { fmtDay, fmtDayTime, STATUS_LABEL } from "@/lib/format";
import {
  acceptAction,
  admitAction,
  admitDirectAction,
  assignDutyAction,
  attachSponsorAction,
  attendAction,
  createEventAction,
  firstHelpAction,
  hoursAction,
  keepAction,
  markGuestAction,
  recordCallAction,
  rejectAction,
  signLawsAction,
  startTermAction,
} from "@/app/actions";
import { requireStaff } from "@/server/club";

function Block({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="mb-4 rounded-2xl border border-line bg-card">
      <summary className="cursor-pointer select-none px-5 py-4 text-[17px] font-bold">{title}</summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}

/** Штаб: всё, что в боте делали бы команды для создателя и Совета. Только создатель и члены Совета. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const v = await requireStaff();
  const sp = await searchParams;
  const { store, now } = v;
  const members = await store.t.members.list();
  const byId = new Map(members.map((m) => [m.id, m]));
  const label = (id: string | null) => (id ? memberLabel(byId.get(id)) : "—");
  const refOptions = members.filter((m) => !["left", "expelled", "candidate"].includes(m.status)).map((m) => ({ value: m.number != null ? String(m.number) : `id:${m.id}`, label: memberLabel(m) }));
  const events = (await store.t.events.list()).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const apps = await store.t.applications.list();
  const reviews = await store.t.application_reviews.list();
  const helps = await store.t.helps.list();
  const firstHelp = await store.t.first_help.list();
  const tasks = await store.t.useful_tasks.list();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : prevMonthKey(monthKey(now));
  const report = await computeMetrics(store, now, month);
  const thisMonth = monthKey(now);

  const candidates = apps.filter((a) => ["review", "call", "call_done"].includes(a.status));
  const probation = members.filter((m) => m.status === "probation");
  const exited = members.filter((m) => m.status === "left" && m.left_reason === "probation_empty");

  return (
    <>
      <BackLink href="/council">Совет</BackLink>
      <PageHeader title="Штаб" lead="Приём кандидатов, события, роли и месячный отчёт. Всё, что бот делал бы командами." />

      <Block title={`Кандидаты (${candidates.length})`} open={candidates.length > 0}>
        {candidates.length === 0 && <p className="text-[14.5px] text-mute">Сейчас никого на рассмотрении.</p>}
        {candidates.map((a) => {
          const m = byId.get(a.member_id)!;
          const mine = reviews.filter((r) => r.application_id === a.id);
          const task = tasks.find((t) => t.id === a.useful_task_id);
          return (
            <Card key={a.id} className="mb-4">
              <Eyebrow>
                {a.status === "review" ? "анкета на проверке" : a.status === "call" ? "ждёт звонка" : "звонок записан"}
              </Eyebrow>
              <h3 className="text-[18px] font-bold">{memberLabel(m)} <span className="text-[13px] font-semibold text-mute">@{m.tg_username}</span></h3>
              <p className="mt-1 text-[13px] text-mute">
                Поручитель: {label(m.sponsor_id)} · проверяющие: {a.reviewer_ids.length ? a.reviewer_ids.map(label).join(", ") : "ещё не назначены"} · оценок {mine.length} из {QUESTIONS.length * 2}
              </p>
              {a.status === "call" && (
                <ActionForm action={recordCallAction} className="mt-4">
                  <input type="hidden" name="application_id" value={a.id} />
                  <Field multiline rows={3} name="main_request" required label="Главный запрос кандидата (дословно со звонка)" />
                  <Field className="mt-4" multiline rows={2} name="notes" label="Заметки по звонку" />
                  <div className="mt-4"><SubmitButton>Записать звонок</SubmitButton></div>
                </ActionForm>
              )}
              {a.status === "call_done" && (
                <>
                  <p className="mt-3 rounded-xl bg-card-2 p-3 text-[14px] leading-snug">«{a.main_request}»</p>
                  <p className="mt-2 text-[13px] text-mute">Взнос пользой: {task ? task.title : "кандидат ещё не выбрал задачу"}</p>
                  <ActionForm action={acceptAction} className="mt-4">
                    <input type="hidden" name="member_id" value={m.id} />
                    <Field name="reason" required label="Причина приёма (её увидит клуб)" />
                    <div className="mt-3"><SubmitButton>Принять на испытательный месяц</SubmitButton></div>
                  </ActionForm>
                </>
              )}
              {a.status !== "review" && (
                <ActionForm action={rejectAction} className="mt-4">
                  <input type="hidden" name="member_id" value={m.id} />
                  <Field name="reason" required label="Причина отказа (её увидит клуб, без личных деталей)" />
                  <div className="mt-3"><SubmitButton variant="outline">Отказать</SubmitButton></div>
                </ActionForm>
              )}
            </Card>
          );
        })}
        <ActionForm action={attachSponsorAction} className="mt-2">
          <Eyebrow>Закрепить поручителя за кандидатом</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            <Field name="candidate" required label="Кандидат" placeholder="@ник" />
            <Field name="sponsor" required label="Поручитель" placeholder="номер" />
          </div>
          <div className="mt-3"><SubmitButton variant="outline">Закрепить</SubmitButton></div>
        </ActionForm>
      </Block>

      <Block title={`Испытательный месяц (${probation.length})`} open={probation.length > 0}>
        {probation.length === 0 && <p className="text-[14.5px] text-mute">Нет.</p>}
        {probation.map((m) => {
          const gave = helps.filter((h) => h.helper_id === m.id && Date.parse(h.confirmed_at) >= Date.parse(m.joined_at ?? "")).length;
          const fh = firstHelp.find((f) => f.member_id === m.id);
          return (
            <Card key={m.id} className="mb-4">
              <h3 className="text-[17px] font-bold">{memberLabel(m)}</h3>
              <p className="mt-1 text-[13px] leading-snug text-mute">
                до {m.probation_until ? fmtDay(m.probation_until) : "—"} · помог(ла): {gave} · первая помощь: {fh ? `${fh.status}, срок ${fh.talk_deadline ? fmtDay(fh.talk_deadline) : "—"}` : "—"}
              </p>
              {fh && <p className="mt-2 rounded-xl bg-card-2 p-3 text-[13.5px] leading-snug">«{fh.main_request}»</p>}
              <ActionForm action={admitAction} className="mt-4">
                <input type="hidden" name="member_id" value={m.id} />
                <Field name="reason" label="Причина (необязательно)" placeholder="помощь в испытательный месяц подтверждена" />
                <div className="mt-3"><SubmitButton>{gave === 0 ? "Посвятить (пока нельзя: нет помощи)" : "Посвятить: выдать номер"}</SubmitButton></div>
              </ActionForm>
            </Card>
          );
        })}
        {exited.length > 0 && <Eyebrow className="mt-4">Вышли по пустому месяцу — Совет может отменить</Eyebrow>}
        {exited.map((m) => (
          <ActionForm key={m.id} action={keepAction} className="mb-4">
            <input type="hidden" name="member_id" value={m.id} />
            <p className="mb-2 text-[14.5px] font-semibold">{memberLabel(m)}</p>
            <Field name="reason" required label="Причина отмены (публикуется)" />
            <div className="mt-3"><SubmitButton variant="outline">Отменить выход</SubmitButton></div>
          </ActionForm>
        ))}
      </Block>

      <Block title="События, гости, явка">
        <ActionForm action={createEventAction}>
          <Eyebrow>Новое событие</Eyebrow>
          <Field name="title" required label="Название" placeholder="Открытая встреча" />
          <Field className="mt-3" name="starts_at" required type="datetime-local" label="Когда (время по Берлину)" />
          <div className="mt-3"><Toggle name="open" title="Открытое событие" hint="На открытом можно отмечать гостей" defaultChecked /></div>
          <div className="mt-4"><SubmitButton>Создать</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={markGuestAction}>
          <Eyebrow>Отметить гостя</Eyebrow>
          <SelectField name="event_id" required label="Событие" options={events.filter((e) => e.is_open).map((e) => ({ value: e.id, label: `${fmtDay(e.starts_at)} · ${e.title}` }))} />
          <Field className="mt-3" name="who" required label="@ник или Telegram id" placeholder="@alisa_t" />
          <div className="mt-4"><SubmitButton>Отметить гостем</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={attendAction}>
          <Eyebrow>Отметить явку</Eyebrow>
          <SelectField name="event_id" required label="Событие" options={events.map((e) => ({ value: e.id, label: `${fmtDay(e.starts_at)} · ${e.title}` }))} />
          <div className="mt-4">
            <ChoiceGroup type="checkbox" name="member_ids" options={members.filter((m) => ["member", "partner", "council", "probation"].includes(m.status)).map((m) => ({ value: m.id, label: memberLabel(m) }))} />
          </div>
          <div className="mt-4"><SubmitButton>Отметить</SubmitButton></div>
        </ActionForm>
      </Block>

      <Block title="Роли, дежурный, часы, законы">
        <ActionForm action={assignDutyAction}>
          <SelectField name="ref" required label="Дежурный по доске на эту неделю" options={refOptions} />
          <div className="mt-3"><SubmitButton variant="outline">Назначить</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={hoursAction}>
          <Field name="hours" required type="number" label="Мои часы за эту неделю" placeholder="12" />
          <div className="mt-3"><SubmitButton variant="outline">Записать</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={signLawsAction}>
          <SelectField name="ref" required label="Подписал(а) законы" options={refOptions} />
          <div className="mt-3"><SubmitButton variant="outline">Отметить подпись</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={startTermAction}>
          <SelectField name="ref" required label="Начать срок в Совете (год, не больше двух подряд)" options={refOptions} />
          <div className="mt-3"><SubmitButton variant="outline">Начать срок</SubmitButton></div>
        </ActionForm>
        <hr className="my-6 border-line" />
        <ActionForm action={firstHelpAction}>
          <SelectField name="ref" required label="Первая помощь новичка" options={refOptions.concat(probation.map((m) => ({ value: `id:${m.id}`, label: memberLabel(m) })))} />
          <ChoiceGroup className="mt-3" name="status" required defaultValue="talked" options={[{ value: "talked", label: "Поговорили" }, { value: "helped", label: "Помогли" }, { value: "no_solution_told", label: "Решения нет, сказали прямо" }]} />
          <div className="mt-3"><SubmitButton variant="outline">Обновить</SubmitButton></div>
        </ActionForm>
      </Block>

      <Block title="Добавить участника без анкеты (ядро клуба)">
        <p className="mb-4 text-[13px] leading-snug text-mute">Для первых участников. Получит следующий номер; запись останется в журнале Совета. Когда человек впервые откроет бота, ник свяжется с его Telegram id.</p>
        <ActionForm action={admitDirectAction}>
          <Field name="who" required label="@ник или Telegram id" />
          <Field className="mt-3" name="name" required label="Имя" />
          <Field className="mt-3" name="reason" label="Причина (необязательно)" placeholder="ядро клуба" />
          <div className="mt-4"><SubmitButton>Добавить</SubmitButton></div>
        </ActionForm>
      </Block>

      <Block title={`Отчёт за ${report.month}`} open>
        <div className="mb-4 flex gap-4 text-[13px] font-bold">
          <Link href={`/staff?month=${prevMonthKey(thisMonth)}`} className="text-accent">прошлый месяц</Link>
          <Link href={`/staff?month=${thisMonth}`} className="text-accent">текущий</Link>
          <Link href={`/staff?month=${prevMonthKey(prevMonthKey(thisMonth))}`} className="text-accent">позапрошлый</Link>
        </div>
        <pre className="whitespace-pre-wrap rounded-xl bg-card-2 p-4 text-[12.5px] leading-relaxed">{formatReport(report)}</pre>
        {/* eslint-disable @next/next/no-html-link-for-pages -- это скачивание файла, а не переход между экранами */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-[13px] font-bold text-accent">
          <a href="/staff/csv/participants">участники.csv</a>
          <a href="/staff/csv/helps">помощь.csv</a>
          <a href="/staff/csv/meetings">встречи.csv</a>
          <a href="/staff/csv/credits">кредиты.csv</a>
        </div>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </Block>

      <p className="mt-6 text-center text-[11.5px] text-mute">Сейчас: {fmtDayTime(now)} · {STATUS_LABEL[v.member.status]}</p>
    </>
  );
}

import { redirect } from "next/navigation";
import { QUESTIONS } from "@core/application_text";
import { getApplication } from "@core/selection";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { ChoiceGroup } from "@/components/forms/Choice";
import { Plaque } from "@/components/club/Plaque";
import { Card, Eyebrow } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { chooseTaskAction, joinAction, saveApplicationAction } from "@/app/actions";
import { getViewer } from "@/server/club";

/** Вход в клуб: кодовое слово → проверка гостя → анкета → задача для взноса пользой → звонок. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ sponsor_error?: string }> }) {
  const v = await getViewer();
  const sp = await searchParams;
  if (v.inside) redirect("/");
  const m = v.member;

  if (m && (m.status === "left" || m.status === "expelled")) {
    return (
      <>
        <Plaque />
        <Card className="mt-8">
          <Eyebrow>Ты вышел из клуба</Eyebrow>
          <p className="text-[15px] leading-snug">Личные данные удалены, записи о помощи остались под подписью «бывший участник». Вернуться можно только через новый отбор.</p>
        </Card>
      </>
    );
  }

  if (!m || m.status !== "candidate") {
    return (
      <>
        <Plaque />
        <h1 className="mt-8 text-[30px] font-extrabold leading-tight tracking-tight">Вход в клуб</h1>
        <p className="mb-6 mt-2 text-[15px] leading-snug text-mute">Закрытый клуб взаимопомощи русскоязычных во Фрайбурге. Попасть можно только через отбор, не за деньги. Анкета открывается тем, кто был гостем на открытом событии.</p>
        <ActionForm action={joinAction}>
          <Field name="codeword" required label="Кодовое слово" placeholder="Его назвал участник клуба" />
          <Field className="mt-5" name="sponsor" label="Номер того, кто тебя пригласил (если есть)" placeholder="Например: 4" hint="Поручитель — посвящённый участник. Он может привести не больше двух кандидатов в квартал." />
          <label className="mt-5 flex items-start gap-3 text-[13.5px] leading-snug text-mute">
            <input type="checkbox" name="consent" className="mt-1 size-4 accent-[var(--color-accent)]" />
            <span>Согласен(на), что клуб хранит мою анкету и ответы, чтобы принять решение об отборе. {/* TODO(legal): финальный текст согласия, срок хранения и удаление анкет отклонённых кандидатов — решает заказчик (DSGVO). */}</span>
          </label>
          <div className="mt-6">
            <SubmitButton>Продолжить</SubmitButton>
          </div>
        </ActionForm>
        <p className="mt-6 text-[12.5px] leading-snug text-mute">Ты: {v.displayName}{v.username ? ` (@${v.username})` : ""}. Переключить тестового человека можно на странице «Тест» вверху.</p>
      </>
    );
  }

  const app = await getApplication(v.store, m.id);
  if (!app) return <p>Анкета не найдена.</p>;
  const tasks = (await v.store.t.useful_tasks.list({ is_active: true }));
  const chosen = app.useful_task_id ? await v.store.t.useful_tasks.get(app.useful_task_id) : undefined;

  return (
    <>
      <Plaque />
      <h1 className="mt-8 text-[30px] font-extrabold leading-tight tracking-tight">Твоя заявка</h1>
      {sp.sponsor_error && <p className="mt-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-[13.5px] text-warn">{sp.sponsor_error} Продолжаем без поручителя.</p>}

      {app.status === "draft" && (
        <>
          <p className="mb-6 mt-2 text-[15px] leading-snug text-mute">Восемь вопросов. Отвечай конкретно: отписками анкету не пройти. Слишком короткие ответы проверяющие увидят с пометкой.</p>
          <ActionForm action={saveApplicationAction}>
            <div className="space-y-6">
              {QUESTIONS.map((q) => (
                <Field key={q.no} multiline rows={3} name={`a${q.no}`} label={`${q.no}. ${q.text}`} defaultValue={app.answers[q.no - 1]} hint={app.short_flags[q.no - 1] ? "Ответ получился коротким — лучше добавить конкретики." : undefined} />
              ))}
            </div>
            <div className="mt-7 space-y-3">
              <button type="submit" name="intent" value="submit" className="inline-flex w-full items-center justify-center rounded-xl bg-accent px-5 py-4 text-[15.5px] font-bold text-ink">Отправить анкету</button>
              <button type="submit" name="intent" value="save" className="inline-flex w-full items-center justify-center rounded-xl border border-line px-5 py-4 text-[15.5px] font-bold text-fg">Сохранить черновик</button>
            </div>
          </ActionForm>
        </>
      )}

      {app.status === "review" && (
        <Card className="mt-6">
          <Eyebrow>Анкета на проверке</Eyebrow>
          <p className="text-[15px] leading-snug">Её читают двое проверяющих и оценивают каждый ответ. Когда решат — тут появится следующий шаг.</p>
        </Card>
      )}

      {(app.status === "call" || app.status === "call_done") && (
        <>
          <Card highlight className="mt-6">
            <Eyebrow>Анкета принята</Eyebrow>
            <p className="text-[15px] leading-snug">{app.status === "call" ? "Дальше — звонок на 10 минут с двумя проверяющими. Создатель свяжется с тобой." : "Звонок состоялся. Решение о приёме примет создатель или Совет."}</p>
          </Card>
          <SectionTitle>Взнос пользой</SectionTitle>
          <p className="mb-4 text-[14px] leading-snug text-mute">До вступления сделай одно полезное дело для клуба. Выбери задачу из списка.</p>
          {chosen && <p className="mb-3 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Ты выбрал(а): {chosen.title}</p>}
          <ActionForm action={chooseTaskAction}>
            <ChoiceGroup name="task_id" required defaultValue={app.useful_task_id ?? undefined} options={tasks.map((t) => ({ value: t.id, label: t.title }))} />
            <div className="mt-5">
              <SubmitButton variant="outline">{chosen ? "Сменить задачу" : "Взять задачу"}</SubmitButton>
            </div>
          </ActionForm>
        </>
      )}

      {app.status === "rejected" && (
        <Card className="mt-6">
          <Eyebrow>Заявка рассмотрена</Eyebrow>
          <p className="text-[15px] leading-snug">К сожалению, сейчас мы не можем тебя принять. Спасибо, что дошёл(ла) до конца.</p>
        </Card>
      )}
    </>
  );
}

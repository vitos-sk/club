import { QUESTIONS } from "@core/application_text";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { Card, Eyebrow } from "@/components/ui/Card";
import { reviewAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Проверка анкет: каждый ответ оценивают двое проверяющих — «ок» или «отказ». Два «отказа» из восьми — отказ по анкете. */
export default async function ReviewPage() {
  const v = await requireInside();
  const apps = (await v.store.t.applications.list({ status: "review" })).filter((a) => a.reviewer_ids.includes(v.member.id));
  const members = new Map((await v.store.t.members.list()).map((m) => [m.id, m]));
  const cfg = await v.store.getConfig();
  const mineByApp = new Map<string, Awaited<ReturnType<typeof v.store.t.application_reviews.list>>>();
  for (const a of apps) mineByApp.set(a.id, await v.store.t.application_reviews.list({ application_id: a.id, reviewer_id: v.member.id }));
  return (
    <>
      <BackLink />
      <PageHeader title="Проверка анкет" lead={`Оцени каждый ответ по критериям. Если отказ у ${cfg.refusals_to_reject} и более ответов из восьми — отказ по анкете. Решаешь ты, подсказки бота — только пометки.`} />
      {apps.length === 0 && <p className="text-[15px] text-mute">Анкет для тебя нет.</p>}
      {apps.map((a) => {
        const mine = mineByApp.get(a.id) ?? [];
        const verdict = (q: number) => mine.find((r) => r.question_no === q)?.verdict;
        return (
          <ActionForm key={a.id} action={reviewAction} className="mb-8">
            <input type="hidden" name="application_id" value={a.id} />
            <h2 className="mb-1 text-[22px] font-extrabold">{memberLabel(members.get(a.member_id))}</h2>
            <p className="mb-4 text-[13px] text-mute">Твоих оценок: {mine.length} из 8</p>
            {QUESTIONS.map((q) => (
              <Card key={q.no} className="mb-3">
                <Eyebrow>
                  Вопрос {q.no}
                  {a.short_flags[q.no - 1] ? " · ответ подозрительно короткий" : ""}
                </Eyebrow>
                <p className="text-[14px] font-semibold leading-snug text-mute">{q.text}</p>
                <p className="my-3 text-[15.5px] leading-snug">{a.answers[q.no - 1]}</p>
                <p className="mb-3 text-[12px] leading-snug text-mute">
                  Хорошо: {q.good}. Отказ: {q.refuse}.
                </p>
                <div className="flex gap-2">
                  {(["ok", "refuse"] as const).map((val) => (
                    <label key={val} className="relative">
                      <input type="radio" name={`v${q.no}`} value={val} defaultChecked={verdict(q.no) === val} className="peer sr-only" />
                      <span className={`inline-flex cursor-pointer rounded-full border border-line px-4 py-2 text-[13.5px] font-bold text-mute ${val === "ok" ? "peer-checked:border-ok peer-checked:bg-ok peer-checked:text-ink" : "peer-checked:border-danger peer-checked:bg-danger peer-checked:text-ink"}`}>
                        {val === "ok" ? "ок" : "отказ"}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            ))}
            <SubmitButton>Сохранить оценки</SubmitButton>
          </ActionForm>
        );
      })}
    </>
  );
}

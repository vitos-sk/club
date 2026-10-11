import { currentDuty, hungRequests } from "@core/duty";
import { memberLabel } from "@core/members";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { ActionForm, SubmitButton } from "@/components/forms/ActionForm";
import { Card, Eyebrow } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/Field";
import { fmtDayTime } from "@/lib/format";
import { dutyPingAction } from "@/app/actions";
import { requireInside } from "@/server/club";

/** Дежурный по доске: запросы старше 48 часов без отклика. Отметь двоих, кому написал(а) лично. */
export default async function DutyPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const v = await requireInside();
  const sp = await searchParams;
  const duty = await currentDuty(v.store, v.now);
  const isDuty = duty?.id === v.member.id;
  const hung = isDuty ? await hungRequests(v.store, v.now) : [];
  const members = new Map((await v.store.t.members.list()).map((m) => [m.id, m]));
  const people = [...members.values()].filter((m) => ["member", "partner", "council"].includes(m.status) && m.id !== v.member.id);
  return (
    <>
      <BackLink />
      <PageHeader title="Дежурный по доске" lead={duty ? `На этой неделе дежурит ${memberLabel(duty)}.` : "На эту неделю дежурный не назначен. Назначает создатель."} />
      {sp.done && <p role="status" className="mb-5 rounded-xl border border-ok/50 bg-ok/10 px-4 py-3 text-[14px] font-semibold text-ok">Отметки записаны. Они идут в метрику «запросы с откликом за 48 часов».</p>}
      {!isDuty && <p className="text-[15px] text-mute">Эта страница нужна дежурному недели.</p>}
      {isDuty && hung.length === 0 && <p className="text-[15px] text-mute">Зависших запросов нет — все получили отклик или отметки.</p>}
      {hung.map((r) => (
        <Card key={r.id} className="mb-4">
          <Eyebrow>{memberLabel(members.get(r.author_id))} · с {fmtDayTime(r.created_at)}</Eyebrow>
          <h3 className="mb-4 text-[17px] font-bold leading-snug">{r.text}</h3>
          <ActionForm action={dutyPingAction}>
            <input type="hidden" name="request_id" value={r.id} />
            <div className="space-y-3">
              <SelectField name="p1" label="Кому написал(а) первому" required options={people.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
              <SelectField name="p2" label="И второму" required options={people.map((m) => ({ value: m.id, label: memberLabel(m) }))} />
            </div>
            <div className="mt-4">
              <SubmitButton>Отметить</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ))}
    </>
  );
}

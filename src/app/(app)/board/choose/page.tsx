import { PersonRow } from "@/components/club/PersonRow";
import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { responders } from "@/lib/mock";

/** Выбор помощника среди откликнувшихся */
export default function ChooseHelperPage() {
  return (
    <>
      <BackLink href="/board/active">Назад</BackLink>
      <PageHeader title="Кто откликнулся" lead="Выбери, кому доверить задачу. Остальным уйдёт «спасибо за отклик»." />
      <div>
        {responders.map((r) => (
          <PersonRow
            key={r.n}
            n={r.n}
            title={r.niche}
            sub={`«${r.why}»`}
            action={
              <Button href="/board/connected" size="sm">
                Доверить
              </Button>
            }
          />
        ))}
      </div>
    </>
  );
}

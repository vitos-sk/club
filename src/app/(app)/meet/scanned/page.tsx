import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/** Встреча засчитана */
export default function ScannedPage() {
  return (
    <>
      <div className="mx-auto mb-5 mt-6 grid size-16 place-items-center rounded-full bg-ok/15 text-ok">
        <Icon name="check" className="size-8" />
      </div>
      <div className="text-center">
        <PageHeader title="Встреча засчитана" lead="№12 · Бумаги и переводы. Первая встреча с этим человеком: полные баллы, Связи +4." />
      </div>
      <Field label="О чём договорились" placeholder="Одна строка, по желанию (+1 бонус)" />
      <div className="mt-6">
        <Button href="/meet">Готово</Button>
      </div>
    </>
  );
}

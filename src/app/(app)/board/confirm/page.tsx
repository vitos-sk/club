import { BackLink } from "@/components/shell/BackLink";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";

/** Подтверждение полученной помощи: сфера, оценка, короткий отзыв */
export default function ConfirmHelpPage() {
  return (
    <>
      <BackLink href="/board/connected">Назад</BackLink>
      <PageHeader title="Подтверди помощь" lead="От №12. Это поднимает его Пульс, поэтому оценивай честно." />

      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">В какой сфере помогли</div>
      <ChipRow>
        {["Связи", "Идея", "Экспертиза", "Услуга", "Сделка"].map((s, i) => (
          <Chip key={s} active={i === 2}>
            {s}
          </Chip>
        ))}
      </ChipRow>

      <div className="mb-3 mt-7 text-[12px] font-bold uppercase tracking-[0.12em] text-mute">Насколько это было важно</div>
      <ChipRow>
        {["Мелочь", "Серьёзно", "Изменило мою ситуацию"].map((s, i) => (
          <Chip key={s} active={i === 1}>
            {s}
          </Chip>
        ))}
      </ChipRow>

      <Field multiline className="mt-7" label="Короткий отзыв" placeholder="Одной-двумя строками" />
      <p className="mt-3 text-[13px] text-mute">Один и тот же человек подтверждает тебе помощь максимум раз в месяц.</p>
      <div className="mt-7">
        <Button href="/board">Подтвердить</Button>
      </div>
    </>
  );
}

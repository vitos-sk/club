import { Manrope } from "next/font/google";

/**
 * Шрифт проекта. Один файл — чтобы сменить шрифт за минуту.
 * Другие хорошие варианты с кириллицей: Montserrat, Inter, Golos_Text, Forum (для заголовков).
 */
export const fontText = Manrope({
  variable: "--font-text",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

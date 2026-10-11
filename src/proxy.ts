import { NextResponse, type NextRequest } from "next/server";
import { gateToken, safeEqual } from "@core/gate";

/**
 * Пароль на всё приложение. Нужен для публичной ссылки на Vercel: иначе любой, кто её узнал,
 * мог бы в тестовой панели стать создателем. Включается переменной SITE_PASSWORD.
 * На боевом (production) Vercel без пароля приложение закрыто, пока его не задать (или явно не разрешить ALLOW_PUBLIC=1).
 * TODO(auth): когда появится вход через подпись Telegram (этап B), этот пароль станет не нужен.
 */
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (password) {
    const cookie = request.cookies.get("club_gate")?.value ?? "";
    if (safeEqual(cookie, gateToken(password))) return NextResponse.next();
  } else {
    const locked = process.env.VERCEL_ENV === "production" && process.env.ALLOW_PUBLIC !== "1";
    if (!locked) return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

// не трогаем служебные файлы Next, сам экран пароля и файлы с расширением (иконки, шрифты)
export const config = {
  matcher: ["/((?!_next/|gate|.*\\..*).*)"],
};

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { gateToken, safeEqual } from "@core/gate";

export interface GateState {
  error?: string;
}

/** Проверка пароля на вход. Сам пароль нигде не сохраняется: в cookie лежит только его хеш. */
export async function gateAction(_prev: GateState, fd: FormData): Promise<GateState> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return { error: "Пароль на сайте не задан." };
  const given = String(fd.get("password") ?? "");
  if (!safeEqual(gateToken(given), gateToken(password))) {
    await new Promise((r) => setTimeout(r, 600)); // чтобы перебор был медленным
    return { error: "Пароль не подошёл." };
  }
  (await cookies()).set("club_gate", gateToken(password), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  const next = String(fd.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/gate") ? next : "/");
}

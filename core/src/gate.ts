import { createHash, timingSafeEqual } from "node:crypto";

/** Значение cookie «пароль введён»: хеш пароля, сам пароль в cookie не хранится. */
export function gateToken(password: string): string {
  return createHash("sha256").update(`club-gate:${password}`).digest("hex");
}

/** Сравнение строк за одно и то же время, независимо от того, где они различаются. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

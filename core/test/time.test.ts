import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  berlinParts,
  fullMonthsBetween,
  monthKey,
  quarterKey,
  startOfMonth,
  startOfNextMonth,
  startOfQuarter,
  zonedToUtc,
} from "../src/time";

const iso = (d: Date) => d.toISOString();

describe("time (Europe/Berlin)", () => {
  it("zonedToUtc: зимой Берлин = UTC+1, летом UTC+2", () => {
    expect(iso(zonedToUtc(2026, 1, 15, 12, 0))).toBe("2026-01-15T11:00:00.000Z");
    expect(iso(zonedToUtc(2026, 7, 15, 12, 0))).toBe("2026-07-15T10:00:00.000Z");
  });

  it("berlinParts: 31 марта 23:30 UTC уже 1 апреля в Берлине", () => {
    const p = berlinParts(new Date("2026-03-31T23:30:00Z"));
    expect([p.y, p.m, p.d, p.h]).toEqual([2026, 4, 1, 1]);
  });

  it("monthKey считает месяц по Берлину, а не по UTC", () => {
    expect(monthKey(new Date("2026-03-31T23:30:00Z"))).toBe("2026-04");
    expect(monthKey(new Date("2026-03-31T21:30:00Z"))).toBe("2026-03");
  });

  it("startOfMonth / startOfNextMonth возвращают полночь по Берлину", () => {
    const d = new Date("2026-10-11T08:00:00Z");
    expect(iso(startOfMonth(d))).toBe("2026-09-30T22:00:00.000Z");
    expect(iso(startOfNextMonth(d))).toBe("2026-10-31T23:00:00.000Z");
  });

  it("переход на летнее время: полночь 1 апреля в Берлине = 22:00 UTC 31 марта", () => {
    // 29 марта 2026 — переход на летнее время; 1 апреля уже UTC+2
    expect(iso(zonedToUtc(2026, 4, 1))).toBe("2026-03-31T22:00:00.000Z");
    expect(iso(zonedToUtc(2026, 3, 1))).toBe("2026-02-28T23:00:00.000Z");
  });

  it("quarterKey и startOfQuarter", () => {
    expect(quarterKey(new Date("2026-02-10T10:00:00Z"))).toBe("2026-Q1");
    expect(quarterKey(new Date("2026-10-11T10:00:00Z"))).toBe("2026-Q4");
    expect(iso(startOfQuarter(new Date("2026-05-20T10:00:00Z")))).toBe("2026-03-31T22:00:00.000Z");
  });

  it("addMonths обрезает день: 31 января + 1 месяц = 28 февраля", () => {
    const r = addMonths(new Date("2026-01-31T11:00:00Z"), 1);
    expect(iso(r)).toBe("2026-02-28T11:00:00.000Z");
  });

  it("addMonths отрицательный", () => {
    expect(iso(addMonths(new Date("2026-03-15T11:00:00Z"), -12))).toBe("2025-03-15T11:00:00.000Z");
  });

  it("addDays", () => {
    expect(iso(addDays(new Date("2026-10-11T10:00:00Z"), 14))).toBe("2026-10-25T10:00:00.000Z");
  });

  it("fullMonthsBetween: считает только полные месяцы", () => {
    const a = new Date("2026-01-15T10:00:00Z");
    expect(fullMonthsBetween(a, new Date("2026-02-14T10:00:00Z"))).toBe(0);
    expect(fullMonthsBetween(a, new Date("2026-02-15T10:00:00Z"))).toBe(1);
    expect(fullMonthsBetween(a, new Date("2026-04-20T10:00:00Z"))).toBe(3);
    expect(fullMonthsBetween(a, new Date("2027-01-15T10:00:00Z"))).toBe(12);
  });

  it("fullMonthsBetween: до начала даты — 0", () => {
    expect(fullMonthsBetween(new Date("2026-05-01T00:00:00Z"), new Date("2026-04-01T00:00:00Z"))).toBe(0);
  });
});

describe("неделя (понедельник по Берлину)", () => {
  it("startOfWeek: воскресенье 11 октября 2026 → понедельник 5 октября 00:00 по Берлину", async () => {
    const { startOfWeek } = await import("../src/time");
    expect(startOfWeek(new Date("2026-10-11T10:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(startOfWeek(new Date("2026-10-12T10:00:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z");
    // сам понедельник 00:30 по Берлину ещё в новой неделе
    expect(startOfWeek(new Date("2026-10-11T22:30:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });
});

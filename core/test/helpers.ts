import { PULSE_V1 } from "../src/config";
import { MemoryStore } from "../src/store/memory";
import type { Help, Member, Request } from "../src/types";

const T0 = "2026-01-01T00:00:00.000Z";

/** Участник по умолчанию; поля переопределяются. */
export function mkMember(over: Partial<Member> = {}): Omit<Member, "id"> {
  return {
    tg_user_id: null,
    tg_username: null,
    number: null,
    name: null,
    niche: null,
    skills: [],
    status: "member",
    sponsor_id: null,
    sponsor_since: null,
    joined_at: T0,
    laws_signed_at: null,
    paused_until: null,
    is_founder: false,
    is_creator: false,
    probation_until: null,
    left_at: null,
    left_reason: null,
    consent_at: null,
    created_at: T0,
    ...over,
  };
}

export function mkHelp(over: Partial<Help> = {}): Omit<Help, "id"> {
  return {
    helper_id: "h",
    receiver_id: "r",
    sphere_id: "s1",
    grade: 1,
    review: "ок",
    request_id: null,
    created_at: T0,
    confirmed_at: T0,
    ...over,
  };
}

export function mkRequest(over: Partial<Request> = {}): Omit<Request, "id"> {
  return {
    author_id: "a",
    text: "нужна помощь",
    sphere_id: "s1",
    deadline: "2026-02-01T00:00:00.000Z",
    is_urgent: false,
    is_sensitive: false,
    visible_to: [],
    status: "active",
    closed_by_help: false,
    closed_at: null,
    created_at: T0,
    ...over,
  };
}

// ───── вспомогательные сборщики для тестов сервисов ─────
export const NOW = new Date("2026-10-11T10:00:00.000Z");

/** Хранилище с двумя сферами и формулой Пульса v1. */
export async function newStore(): Promise<MemoryStore> {
  const s = new MemoryStore();
  await s.t.spheres.insert({ name: "Бумаги", sort: 1 });
  await s.t.spheres.insert({ name: "Работа", sort: 2 });
  await s.t.pulse_formula_versions.insert({
    version: 1,
    effective_from: "2020-01-01T00:00:00.000Z",
    decision_ref: null,
    params: PULSE_V1,
    created_at: "2020-01-01T00:00:00.000Z",
  });
  return s;
}

let counter = 0;
/** Полноправный участник с номером. */
export async function addMember(s: MemoryStore, over: Partial<Member> = {}) {
  counter++;
  return s.t.members.insert(
    mkMember({ number: counter, name: `Участник ${counter}`, tg_user_id: 1000 + counter, ...over }),
  );
}

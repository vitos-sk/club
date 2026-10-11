/**
 * Тестовые данные для заглушки (Supabase позже). Заказчик — основатель №1 и создатель: ему доступно всё.
 * Все даты — относительно `now`, поэтому после сброса данные «свежие».
 *
 * TODO(user): названия 5 сфер, список полезных задач и внешний круг — заглушки, заменить настоящими.
 */
import { createRequest, createOffer, respondToRequest } from "./board";
import { PULSE_V1 } from "./config";
import { assignDuty } from "./duty";
import { confirmHelp } from "./helps";
import { pressMet, requestMeeting, startMeeting } from "./meetings";
import { takeMonthlySnapshot } from "./pulse_service";
import { createEvent, markAttendance, markGuest, reviewAnswer, saveAnswer, startCandidate, submitApplication } from "./selection";
import { startTerm } from "./council";
import type { Store } from "./store/store";
import { tick } from "./tick";
import { addDays, addHours, startOfMonth } from "./time";
import type { Grade, Id, Member, MemberStatus } from "./types";

export interface Persona {
  tg_user_id: number;
  username: string;
  name: string;
  note: string;
}

/** Люди, которые есть в Telegram, но ещё не в клубе (для проверки пути кандидата). */
export const VISITORS: Persona[] = [
  { tg_user_id: 100901, username: "alisa_t", name: "Алиса Т.", note: "гость события, анкету ещё не начинала" },
  { tg_user_id: 100902, username: "random_user", name: "Случайный человек", note: "не гость: проверка отказа на входе" },
];

export const CREATOR_DEFAULT_TG_ID = 100001;

interface SeedOptions {
  creatorTgId?: number;
}

export async function seedClub(store: Store, now: Date, opts: SeedOptions = {}): Promise<{ creator: Member }> {
  const ago = (d: number) => addDays(now, -d);
  const iso = (d: Date) => d.toISOString();

  // ── справочники ──
  const spheres: Id[] = [];
  for (const [i, name] of ["Работа", "Бумаги и переезд", "Бизнес", "Дизайн и digital", "Быт и знания"].entries()) {
    spheres.push((await store.t.spheres.insert({ name, sort: i + 1 })).id);
  }
  for (const title of [
    "Перевести на русский памятку для новичков клуба",
    "Составить список полезных адресов и телефонов Фрайбурга",
    "Помочь провести открытую встречу: встретить гостей",
    "Записать разбор «Письмо от Finanzamt» для библиотеки",
    "Сделать одну личную рекомендацию: познакомить двух участников",
  ]) await store.t.useful_tasks.insert({ title, is_active: true });
  for (const [name, sph, contact, notes] of [
    ["Юрист по миграционному праву", 1, "t.me/example_lawyer", "Заглушка. Принимает по записи."],
    ["Налоговый консультант (Steuerberater)", 2, "steuer@example.org", "Заглушка. Первая консультация бесплатно."],
    ["Рекрутер IT", 0, "t.me/example_recruiter", "Заглушка."],
  ] as const) await store.t.external_circle.insert({ name, sphere_id: spheres[sph], contact, notes });

  await store.t.pulse_formula_versions.insert({ version: 1, effective_from: iso(ago(400)), decision_ref: null, params: PULSE_V1, created_at: iso(ago(400)) });

  // ── люди ──
  const creatorTg = opts.creatorTgId ?? CREATOR_DEFAULT_TG_ID;
  const people: { n: number; name: string; niche: string; skills: string[]; status: MemberStatus; username: string }[] = [
    { n: 1, name: "Создатель", niche: "Основатель клуба", skills: ["клуб", "отбор", "связи"], status: "council", username: "creator" },
    { n: 2, name: "Марина К.", niche: "Бумаги и переезд", skills: ["Anmeldung", "перевод писем", "Jobcenter"], status: "council", username: "marina_k" },
    { n: 3, name: "Игорь Л.", niche: "Бизнес", skills: ["Gewerbe", "налоги", "ИП"], status: "council", username: "igor_l" },
    { n: 4, name: "Анна С.", niche: "Дизайн и digital", skills: ["логотипы", "Figma"], status: "partner", username: "anna_s" },
    { n: 5, name: "Дмитрий В.", niche: "Работа", skills: ["резюме на немецком", "собеседования"], status: "member", username: "dmitry_v" },
    { n: 6, name: "Елена Р.", niche: "Быт и знания", skills: ["репетитор", "немецкий"], status: "member", username: "elena_r" },
    { n: 7, name: "Сергей Т.", niche: "Бизнес", skills: ["продажи", "переговоры"], status: "member", username: "sergey_t" },
    { n: 8, name: "Ольга Н.", niche: "Бумаги и переезд", skills: ["перевод", "документы"], status: "member", username: "olga_n" },
    { n: 9, name: "Павел Д.", niche: "Работа", skills: ["IT", "рекрутинг"], status: "member", username: "pavel_d" },
    { n: 10, name: "Юлия Ф.", niche: "Дизайн и digital", skills: ["видео", "монтаж"], status: "member", username: "yulia_f" },
    { n: 11, name: "Андрей Б.", niche: "Быт и знания", skills: ["авто", "ремонт"], status: "member", username: "andrey_b" },
    { n: 12, name: "Наталья Г.", niche: "Бизнес", skills: ["бухгалтерия"], status: "member", username: "natalia_g" },
  ];
  const M: Record<number, Member> = {};
  for (const p of people) {
    M[p.n] = await store.t.members.insert({
      tg_user_id: p.n === 1 ? creatorTg : 100000 + p.n,
      tg_username: p.username,
      number: p.n,
      name: p.name,
      niche: p.niche,
      skills: p.skills,
      status: p.status,
      sponsor_id: null,
      sponsor_since: null,
      joined_at: iso(ago(170 - p.n * 3)),
      laws_signed_at: iso(ago(168 - p.n * 3)),
      paused_until: null,
      is_founder: true,
      is_creator: p.n === 1,
      probation_until: null,
      left_at: null,
      left_reason: null,
      consent_at: iso(ago(170)),
      created_at: iso(ago(170)),
    });
  }
  for (const n of [2, 3]) await startTerm(store, now, M[n].id, ago(60));
  await store.setConfig({ reviewer_pool_ids: [M[1].id, M[2].id, M[3].id] });

  // новички на испытательном месяце
  const probation = async (n: number, name: string, daysIn: number, sponsor: number) => {
    const joined = ago(daysIn);
    const m = await store.t.members.insert({
      tg_user_id: 100000 + n,
      tg_username: name.toLowerCase().includes("виктор") ? "viktor_p" : "lena_z",
      number: null,
      name,
      niche: null,
      skills: [],
      status: "probation",
      sponsor_id: M[sponsor].id,
      sponsor_since: iso(addDays(joined, -20)),
      joined_at: iso(joined),
      laws_signed_at: null,
      paused_until: null,
      is_founder: false,
      is_creator: false,
      probation_until: iso(addDays(joined, 30)),
      left_at: null,
      left_reason: null,
      consent_at: iso(joined),
      created_at: iso(addDays(joined, -20)),
    });
    await store.t.first_help.insert({ member_id: m.id, main_request: n === 13 ? "Найти Steuerberater для Gewerbe" : "Нужна помощь с договором аренды: перевод и проверка", sponsor_id: M[sponsor].id, talk_deadline: iso(addDays(joined, 14)), status: "pending", helped_at: null, created_at: iso(addDays(joined, -1)) });
    return m;
  };
  const viktor = await probation(13, "Виктор П.", 10, 3); // помощь уже есть → можно посвящать
  const lena = await probation(14, "Лена З.", 25, 2); // помощи нет, срок первой помощи вышел → выйдет сама

  // ── помощь за 5 месяцев (через сервис — кредиты и первая помощь считаются как в жизни) ──
  const H: [number, number, number, Grade, number, string][] = [
    [145, 2, 4, 3, 1, "Помогла разобраться с письмом из Jobcenter, всё понятно."],
    [140, 3, 5, 1, 2, "Подсказал, с чего начать с Gewerbe."],
    [136, 4, 2, 6, 3, "Сделала логотип за два дня — выручила."],
    [131, 5, 6, 3, 0, "Разобрал резюме, переписали по-немецки."],
    [126, 6, 7, 3, 4, "Объяснила, как готовиться к экзамену по немецкому."],
    [120, 7, 3, 3, 2, "Свёл с клиентом, сделка состоялась."],
    [115, 1, 4, 3, 2, "Познакомил с человеком, который нашёл первого клиента."],
    [112, 8, 9, 1, 1, "Перевела справку."],
    [108, 9, 5, 6, 0, "Нашёл вакансию, пошёл на собеседование и получил оффер."],
    [104, 10, 4, 3, 3, "Смонтировала видео для соцсетей."],
    [100, 4, 10, 3, 3, "Помогла с портфолио."],
    [96, 11, 2, 3, 4, "Посмотрел машину перед покупкой, спас от плохого варианта."],
    [92, 2, 8, 3, 1, "Подсказала, куда идти с Anmeldung."],
    [88, 12, 3, 3, 2, "Сверила бухгалтерию за квартал."],
    [84, 1, 5, 3, 0, "Помог составить план поиска работы."],
    [80, 5, 11, 1, 0, "Проверил резюме."],
    [76, 3, 7, 6, 2, "Помог оформить ИП. Без него было бы сложно."],
    [72, 6, 8, 3, 4, "Позанималась немецким по скайпу."],
    [66, 7, 12, 3, 2, "Переговоры с поставщиком — разобрали вместе."],
    [60, 9, 1, 3, 0, "Подсказал контакты рекрутёров во Фрайбурге."],
    [55, 2, 1, 3, 1, "Перевела письмо от Finanzamt."],
    [50, 4, 1, 3, 3, "Сделала макет для клубной афиши."],
    [44, 8, 4, 1, 1, "Помогла с переводом договора."],
    [40, 10, 6, 3, 3, "Смонтировала короткий ролик."],
    [34, 1, 9, 6, 2, "Познакомил с инвестором — теперь есть шанс на проект."],
    [30, 5, 7, 3, 0, "Резюме и репетиция собеседования."],
    [26, 3, 12, 3, 2, "Налоговый разбор на 30 минут."],
    [22, 12, 5, 1, 2, "Сверила цифры."],
    [18, 1, 8, 3, 0, "Помог с планом поиска работы."],
    [14, 11, 3, 3, 4, "Починил машину в выходные."],
    [11, 6, 5, 3, 4, "Позанималась с сыном немецким."],
    [9, 7, 4, 3, 2, "Совет по переговорам с клиентом."],
    [6, 2, 12, 3, 1, "Подсказала, как оформить переезд."],
    [4, 9, 8, 1, 0, "Подсказал, как составить профиль на LinkedIn."],
  ];
  for (const [d, h, r, g, sph, review] of H) {
    await confirmHelp(store, ago(d), { actor_id: M[r].id, helper_id: M[h].id, receiver_id: M[r].id, sphere_id: spheres[sph], grade: g, review });
  }
  // Виктор уже помог в испытательный месяц
  await confirmHelp(store, ago(3), { actor_id: M[4].id, helper_id: viktor.id, receiver_id: M[4].id, sphere_id: spheres[1], grade: 3, review: "Помог перевести договор аренды. Спасибо!" });

  // ── встречи (первые встречи пар) ──
  const MEET: [number, number, number][] = [
    [120, 1, 2], [110, 1, 3], [100, 1, 4], [90, 1, 5], [75, 1, 7], [60, 2, 4], [55, 3, 5], [50, 4, 6], [45, 5, 8], [40, 6, 9], [35, 7, 10], [30, 8, 11], [25, 9, 12], [15, 1, 9], [8, 2, 3],
  ];
  for (const [d, a, b] of MEET) {
    const t = ago(d);
    await startMeeting(store, t, M[a].id, M[b].id);
    const open = (await store.t.meetings.list()).find((m) => !m.b_confirmed && m.a_id === M[a].id && m.b_id === M[b].id)!;
    await pressMet(store, t, { meeting_id: open.id, member_id: M[b].id });
  }

  // ── события, гости, явка ──
  const pastEvent = await createEvent(store, ago(21), { by: M[1].id, title: "Открытая встреча во Фрайбурге", starts_at: iso(ago(20)), is_open: true });
  await createEvent(store, ago(1), { by: M[1].id, title: "Горячий стул (онлайн)", starts_at: iso(addDays(now, 4)), is_open: false });
  await createEvent(store, ago(1), { by: M[1].id, title: "Живая встреча клуба", starts_at: iso(addDays(now, 7)), is_open: false });
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9]) await markAttendance(store, ago(20), { by: M[1].id, event_id: pastEvent.id, member_id: M[n].id });
  await markGuest(store, ago(20), { by: M[1].id, event_id: pastEvent.id, tg_user_id: 100801, tg_username: "kirill_m" });
  await markGuest(store, ago(20), { by: M[1].id, event_id: pastEvent.id, tg_username: "alisa_t" }); // Алиса отмечена по нику; id узнаем при первом входе

  // ── кандидат Кирилл: анкета на проверке; создатель ещё не оценил ──
  const kir = await startCandidate(store, ago(6), { tg_user_id: 100801, tg_username: "kirill_m", name: "Кирилл М.", codeword: "Движение", sponsor_id: M[4].id });
  if (kir.ok) {
    const answers = [
      "Мне ближе закон «сначала отдаёшь, потом просишь»: в прошлом году мне бесплатно помогли с Anmeldung, и я хочу вернуть это.",
      "Я графический дизайнер, живу во Фрайбурге два года, работаю на фрилансе.",
      "Брендинг и логотипы; вёрстка в Figma; знакомства в местных стартапах.",
      "Могу сделать логотип или визитку для участника клуба за один вечер, бесплатно.",
      "За 6 месяцев — выйти на 2000 евро в месяц с фриланса и найти двух постоянных клиентов.",
      "Нормально.",
      "Помог соседке перевести письмо из Finanzamt и объяснил, какие документы приложить: она вовремя ответила и избежала штрафа.",
      "Да, 30 минут в неделю могу выделить свободно.",
    ];
    for (const [i, a] of answers.entries()) await saveAnswer(store, ago(6), kir.application.id, i + 1, a);
    const app = await submitApplication(store, ago(5), kir.application.id);
    const first = app.reviewer_ids.find((id) => id !== M[1].id) ?? app.reviewer_ids[0];
    for (let q = 1; q <= 8; q++) await reviewAnswer(store, ago(4), { application_id: app.id, reviewer_id: first, question_no: q, verdict: q === 6 ? "refuse" : "ok" });
  }

  // ── доска ──
  const creatorBacked = M[1];
  void creatorBacked;
  await createRequest(store, ago(3), { author_id: M[4].id, text: "Нужен перевод письма от Jobcenter на русский", sphere_id: spheres[1], deadline: iso(addDays(now, 5)), is_urgent: false, is_sensitive: false, visible_to: [] });
  const urgent = await createRequest(store, ago(1), { author_id: M[5].id, text: "Ищу Steuerberater во Фрайбурге для Gewerbe", sphere_id: spheres[2], deadline: iso(addDays(now, 8)), is_urgent: true, is_sensitive: false, visible_to: [] });
  await respondToRequest(store, addHours(ago(1), 3), { request_id: urgent.id, responder_id: M[3].id, message: "Знаю хорошего, помогу бесплатно.", mode: "help" });
  await respondToRequest(store, addHours(ago(1), 5), { request_id: urgent.id, responder_id: M[12].id, message: "Могу вести бухгалтерию за деньги, по клубным условиям.", mode: "order" });
  await createRequest(store, ago(2), { author_id: M[8].id, text: "Деликатный вопрос по документам — нужен человек, кто в теме", sphere_id: spheres[1], deadline: iso(addDays(now, 10)), is_urgent: false, is_sensitive: true, visible_to: [M[2].id] });
  await createOffer(store, ago(30), { author_id: M[5].id, text: "Резюме на немецком + 30 минут разбора собеседования", sphere_id: spheres[0] });
  await createOffer(store, ago(20), { author_id: M[10].id, text: "Видео и монтаж для соцсетей — клубная скидка 20%", sphere_id: spheres[3] });
  await createOffer(store, ago(10), { author_id: M[2].id, text: "Помогу с Anmeldung и поиском квартиры во Фрайбурге", sphere_id: spheres[1] });
  await assignDuty(store, now, M[6].id);

  // ── запрос встречи к создателю по кредиту (обязательная встреча) ──
  await requestMeeting(store, ago(5), { from_id: M[4].id, to_id: M[1].id, uses_credit: true, purpose: "Обсудить идею клубной афиши" });

  // ── часы создателя ──
  for (const [i, h] of [9, 11, 12, 10, 13, 12, 14, 11].entries()) {
    const week = addDays(startOfMonth(now), -7 * (i + 1));
    await store.t.creator_hours.insert({ week_start: iso(week), hours: h, created_at: iso(week) });
  }

  // ── снимки Пульса за три прошлых месяца, потом плановые задачи (письма во «Входящие») ──
  for (let k = 3; k >= 1; k--) await takeMonthlySnapshot(store, addDays(startOfMonth(now), -30 * (k - 1) + 1));
  await tick(store, now);

  void lena;
  return { creator: M[1] };
}

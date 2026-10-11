/**
 * Сущности. Имена и поля — 1:1 с будущими таблицами Postgres (snake_case).
 * Время — ISO-строки в UTC. Пола участников не храним.
 */

export type Id = string;
export type Iso = string;

export type MemberStatus =
  | "candidate"
  | "probation"
  | "member"
  | "partner"
  | "council"
  | "stopped"
  | "paused"
  | "left"
  | "expelled";

/** Полноправные участники (с номером, прошли посвящение). */
export const ACTIVE_STATUSES: readonly MemberStatus[] = ["member", "partner", "council"];
/** Все, кто сейчас «внутри» клуба и может помогать/встречаться (включая испытательный). */
export const INSIDE_STATUSES: readonly MemberStatus[] = ["probation", "member", "partner", "council"];

export interface Member {
  id: Id;
  tg_user_id: number | null;
  tg_username: string | null; // без @, в нижнем регистре
  number: number | null; // выдаётся при посвящении
  name: string | null;
  niche: string | null;
  skills: string[];
  status: MemberStatus;
  sponsor_id: Id | null;
  sponsor_since: Iso | null; // когда поручитель закреплён за кандидатом (для лимита «2 в квартал»)
  joined_at: Iso | null; // начало испытательного месяца
  laws_signed_at: Iso | null;
  paused_until: Iso | null;
  is_founder: boolean; // первые 30
  is_creator: boolean;
  probation_until: Iso | null;
  left_at: Iso | null;
  left_reason: string | null;
  consent_at: Iso | null; // TODO(legal): текст согласия и срок хранения — решает заказчик
  created_at: Iso;
}

export interface EventRow {
  id: Id;
  title: string;
  starts_at: Iso;
  is_open: boolean;
  created_by: Id;
}

export interface Guest {
  id: Id;
  tg_user_id: number | null;
  tg_username: string | null;
  event_id: Id;
  marked_by: Id;
  created_at: Iso;
}

export interface Attendance {
  id: Id;
  event_id: Id;
  member_id: Id;
  marked_by: Id;
  created_at: Iso;
}

export type ApplicationStatus = "draft" | "review" | "call" | "call_done" | "rejected" | "accepted";

export interface Application {
  id: Id;
  member_id: Id;
  answers: string[]; // 8 штук, пустая строка = не отвечено
  short_flags: boolean[]; // «подозрительно короткий ответ»
  reviewer_ids: Id[]; // двое проверяющих
  status: ApplicationStatus;
  call_notes: string | null;
  main_request: string | null; // главный запрос дословно со звонка
  useful_task_id: Id | null;
  useful_done_at: Iso | null;
  reject_reason: string | null;
  submitted_at: Iso | null;
  decided_at: Iso | null;
  created_at: Iso;
}

export type Verdict = "ok" | "refuse";

export interface ApplicationReview {
  id: Id;
  application_id: Id;
  reviewer_id: Id;
  question_no: number; // 1–8
  verdict: Verdict;
  created_at: Iso;
}

export interface UsefulTask {
  id: Id;
  title: string;
  is_active: boolean;
}

export interface Sphere {
  id: Id;
  name: string;
  sort: number;
}

/** Внешний круг специалистов. Видят только создатель и Совет. */
export interface ExternalContact {
  id: Id;
  name: string;
  sphere_id: Id;
  contact: string;
  notes: string;
}

export type Grade = 1 | 3 | 6;

export interface Help {
  id: Id;
  helper_id: Id;
  receiver_id: Id;
  sphere_id: Id;
  grade: Grade;
  review: string;
  request_id: Id | null;
  created_at: Iso;
  confirmed_at: Iso; // подтверждает только получатель; строка создаётся в момент подтверждения
}

export interface Meeting {
  id: Id;
  a_id: Id;
  b_id: Id;
  request_id: Id | null;
  via_credit: boolean;
  a_confirmed: boolean;
  b_confirmed: boolean;
  is_first: boolean | null; // для пары; выставляется, когда нажали обе стороны
  created_at: Iso;
  met_at: Iso | null; // когда нажала вторая сторона
}

export type MeetingRequestStatus =
  | "pending"
  | "postponed"
  | "met"
  | "canceled"
  | "missed"
  | "declined"
  | "expired";

export interface MeetingRequest {
  id: Id;
  from_id: Id;
  to_id: Id;
  uses_credit: boolean;
  purpose: string;
  created_at: Iso;
  deadline: Iso; // +14 дней (для перенесённых — от postponed_to)
  status: MeetingRequestStatus;
  postponed_to: Iso | null;
  counted_month: string; // месяц, в котором запрос считается в потолок получателя
  meeting_id: Id | null;
}

export type CreditReason = "grant" | "reserve" | "release" | "spend";

export interface CreditEntry {
  id: Id;
  member_id: Id;
  delta: number;
  reason: CreditReason;
  ref_id: Id | null;
  created_at: Iso;
}

export type RequestStatus = "active" | "closed" | "canceled" | "expired";

export interface Request {
  id: Id;
  author_id: Id;
  text: string;
  sphere_id: Id;
  deadline: Iso;
  is_urgent: boolean;
  is_sensitive: boolean;
  visible_to: Id[]; // для деликатных: выбранные люди (Совет видит всегда)
  status: RequestStatus;
  closed_by_help: boolean;
  closed_at: Iso | null;
  created_at: Iso;
}

export interface Offer {
  id: Id;
  author_id: Id;
  text: string;
  sphere_id: Id;
  is_active: boolean;
  created_at: Iso;
}

export type ResponseMode = "help" | "order";

export interface Response {
  id: Id;
  request_id: Id;
  responder_id: Id;
  message: string;
  mode: ResponseMode; // выбирается ДО начала работы и не меняется
  is_chosen: boolean;
  created_at: Iso;
}

export type FirstHelpStatus = "pending" | "talked" | "helped" | "no_solution_told";

export interface FirstHelp {
  id: Id;
  member_id: Id;
  main_request: string;
  sponsor_id: Id | null;
  talk_deadline: Iso | null; // +14 дней от начала испытательного
  status: FirstHelpStatus;
  helped_at: Iso | null;
  created_at: Iso;
}

export interface DutyRoster {
  id: Id;
  week_start: Iso;
  member_id: Id;
}

export interface DutyPing {
  id: Id;
  request_id: Id;
  duty_member_id: Id;
  pinged_member_id: Id;
  created_at: Iso;
}

export type DecisionKind =
  | "admission" // приём на испытательный месяц
  | "rejection" // отказ кандидату
  | "initiation" // посвящение, выдача номера
  | "probation_override" // отмена авто-выхода
  | "expulsion"
  | "fund_payout"
  | "appeal"
  | "formula_change";

export interface CouncilDecision {
  id: Id;
  kind: DecisionKind;
  subject_id: Id | null;
  decided_by: Id;
  public_reason: string; // публикуется в «Новостях NEXT», без личных деталей
  created_at: Iso;
}

export interface CouncilVote {
  id: Id;
  decision_id: Id;
  voter_id: Id;
  vote: "yes" | "no" | "recuse";
  created_at: Iso;
}

export interface CouncilTerm {
  id: Id;
  member_id: Id;
  starts_on: Iso;
  ends_on: Iso;
  term_no: number; // 1 или 2 подряд
  warned_at: Iso | null;
}

export type JournalKind =
  | "meeting_missed"
  | "stopped_talk_needed"
  | "first_help_overdue"
  | "probation_exit"
  | "probation_ready"
  | "direct_admit"
  | "pair_audit";

export interface CouncilJournalRow {
  id: Id;
  kind: JournalKind;
  member_id: Id | null;
  ref_id: Id | null;
  note: string;
  created_at: Iso;
}

export interface PulseParams {
  weight_contribution: number; // 75
  weight_connections: number; // 25
  grade_points: Record<Grade, number>; // 1/3/6
  repeat_window_months: number; // 12
  reciprocity_factor: number; // 0.25
  reciprocity_window_months: number; // 12
  pair_cap: number; // 8
  pair_cap_window_months: number; // 12
  pair_cap_mode: "sequential" | "proportional";
  decay_per_month: number; // 0.9
  diversity_target: number; // 6
  contribution_divisor: number; // 35
  connections_window_months: number; // 6
  connections_divisor: number; // 8
}

export interface PulseFormulaVersion {
  id: Id;
  version: number;
  effective_from: Iso;
  decision_ref: string | null; // ссылка на решение Совета; без неё новая версия не вступает в силу
  params: PulseParams;
  created_at: Iso;
}

export interface PulseSnapshot {
  id: Id;
  member_id: Id;
  month_key: string;
  value: number;
  contribution: number;
  connections: number;
  formula_version: number;
  created_at: Iso;
}

export interface CreatorHours {
  id: Id;
  week_start: Iso;
  hours: number;
  created_at: Iso;
}

export interface BotSession {
  id: Id; // = String(tg_user_id)
  tg_user_id: number;
  state: string;
  data: Record<string, unknown>;
  updated_at: Iso;
}

export interface SentNotification {
  id: Id;
  key: string;
  created_at: Iso;
}

/** Все таблицы Store. */
export interface TableMap {
  members: Member;
  events: EventRow;
  guests: Guest;
  attendance: Attendance;
  applications: Application;
  application_reviews: ApplicationReview;
  useful_tasks: UsefulTask;
  spheres: Sphere;
  external_circle: ExternalContact;
  helps: Help;
  meetings: Meeting;
  meeting_requests: MeetingRequest;
  credit_ledger: CreditEntry;
  requests: Request;
  offers: Offer;
  responses: Response;
  first_help: FirstHelp;
  duty_roster: DutyRoster;
  duty_pings: DutyPing;
  council_decisions: CouncilDecision;
  council_votes: CouncilVote;
  council_terms: CouncilTerm;
  council_journal: CouncilJournalRow;
  pulse_formula_versions: PulseFormulaVersion;
  pulse_snapshots: PulseSnapshot;
  creator_hours: CreatorHours;
  bot_sessions: BotSession;
  sent_notifications: SentNotification;
}

export type TableName = keyof TableMap;
export const TABLE_NAMES: TableName[] = [
  "members",
  "events",
  "guests",
  "attendance",
  "applications",
  "application_reviews",
  "useful_tasks",
  "spheres",
  "external_circle",
  "helps",
  "meetings",
  "meeting_requests",
  "credit_ledger",
  "requests",
  "offers",
  "responses",
  "first_help",
  "duty_roster",
  "duty_pings",
  "council_decisions",
  "council_votes",
  "council_terms",
  "council_journal",
  "pulse_formula_versions",
  "pulse_snapshots",
  "creator_hours",
  "bot_sessions",
  "sent_notifications",
];

/** Ошибки домена: текст — по-русски, на «ты», его можно показывать пользователю. */
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Нарушение ограничения хранилища (аналог CHECK / UNIQUE в Postgres). */
export class ConstraintError extends Error {
  constructor(
    public table: string,
    public constraint: string,
  ) {
    super(`constraint ${table}.${constraint}`);
    this.name = "ConstraintError";
  }
}

export class AccessError extends DomainError {
  constructor(message = "Это тебе недоступно.") {
    super("access_denied", message);
    this.name = "AccessError";
  }
}

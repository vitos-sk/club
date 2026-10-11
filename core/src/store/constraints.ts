import type { TableMap, TableName } from "../types";

/**
 * Ограничения «как в базе». Возвращают имя нарушенного ограничения или null.
 * `others` — остальные строки таблицы (без самой проверяемой), `prev` — старая версия при update.
 */
type Check<T> = (next: T, others: T[], prev?: T) => string | null;

type Constraints = { [K in TableName]?: Check<TableMap[K]>[] };

export const CONSTRAINTS: Constraints = {
  members: [
    (n, o) => (n.number != null && o.some((x) => x.number === n.number) ? "unique_number" : null),
    (n, o) => (n.tg_user_id != null && o.some((x) => x.tg_user_id === n.tg_user_id) ? "unique_tg_user_id" : null),
  ],
  helps: [
    (n) => (n.grade === 1 || n.grade === 3 || n.grade === 6 ? null : "grade_in_1_3_6"),
    (n) => (n.helper_id === n.receiver_id ? "helper_ne_receiver" : null),
  ],
  // частичный уникальный индекс: один активный запрос на человека
  requests: [(n, o) => (n.status === "active" && o.some((x) => x.author_id === n.author_id && x.status === "active") ? "one_active_request_per_author" : null)],
  // частичный уникальный индекс: одно активное предложение на человека
  offers: [(n, o) => (n.is_active && o.some((x) => x.author_id === n.author_id && x.is_active) ? "one_active_offer_per_author" : null)],
  responses: [
    (n, o) => (o.some((x) => x.request_id === n.request_id && x.responder_id === n.responder_id) ? "unique_response_per_request" : null),
    (n) => (n.mode === "help" || n.mode === "order" ? null : "mode_valid"),
    (n, _o, p) => (p && p.mode !== n.mode ? "mode_immutable" : null),
  ],
  application_reviews: [
    (n, o) => (o.some((x) => x.application_id === n.application_id && x.reviewer_id === n.reviewer_id && x.question_no === n.question_no) ? "unique_review" : null),
    (n) => (n.verdict === "ok" || n.verdict === "refuse" ? null : "verdict_valid"),
    (n) => (Number.isInteger(n.question_no) && n.question_no >= 1 && n.question_no <= 8 ? null : "question_no_1_8"),
  ],
  pulse_snapshots: [(n, o) => (o.some((x) => x.member_id === n.member_id && x.month_key === n.month_key) ? "unique_snapshot_per_month" : null)],
  sent_notifications: [(n, o) => (o.some((x) => x.key === n.key) ? "unique_key" : null)],
  attendance: [(n, o) => (o.some((x) => x.event_id === n.event_id && x.member_id === n.member_id) ? "unique_attendance" : null)],
  duty_roster: [(n, o) => (o.some((x) => x.week_start === n.week_start) ? "one_duty_per_week" : null)],
  credit_ledger: [(n) => (["grant", "reserve", "release", "spend"].includes(n.reason) ? null : "reason_valid")],
};

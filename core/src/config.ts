import type { Id, PulseParams } from "./types";

/** Метрики приборной панели (раздел 11 инструкции). */
export type MetricKey =
  | "active_share"
  | "newcomer_first_help"
  | "retention_3m"
  | "response_48h"
  | "closed_requests"
  | "contribution_concentration"
  | "attendance"
  | "mutual_pairs"
  | "creator_hours"
  | "rejection_quota";

export interface Threshold {
  /** true — чем больше, тем лучше (доли); false — чем меньше, тем лучше (концентрация, часы). */
  higher_is_better: boolean;
  /** Значение «норма» (граница включительно). */
  norm: number;
  /** Граница «тревога» (строго). */
  alarm: number;
  /** Сколько месяцев подряд нужно для тревоги (по умолчанию 1). */
  alarm_months: number;
  /** Тревога по активности: гасится в тихие месяцы. */
  activity: boolean;
}

/** Пороги из раздела 6 контекста. Доли — 0..1, часы — часы в неделю. */
export const DEFAULT_THRESHOLDS: Record<MetricKey, Threshold> = {
  active_share: { higher_is_better: true, norm: 0.5, alarm: 0.35, alarm_months: 2, activity: true },
  newcomer_first_help: { higher_is_better: true, norm: 0.6, alarm: 0.5, alarm_months: 1, activity: false },
  retention_3m: { higher_is_better: true, norm: 0.7, alarm: 0.55, alarm_months: 1, activity: false },
  response_48h: { higher_is_better: true, norm: 0.7, alarm: 0.5, alarm_months: 1, activity: true },
  closed_requests: { higher_is_better: true, norm: 0.5, alarm: 0.35, alarm_months: 1, activity: true },
  contribution_concentration: { higher_is_better: false, norm: 0.6, alarm: 0.7, alarm_months: 1, activity: false },
  attendance: { higher_is_better: true, norm: 0.5, alarm: 0.35, alarm_months: 1, activity: true },
  mutual_pairs: { higher_is_better: false, norm: 0, alarm: 0, alarm_months: 1, activity: false },
  creator_hours: { higher_is_better: false, norm: 12, alarm: 15, alarm_months: 3, activity: false },
  rejection_quota: { higher_is_better: true, norm: 1 / 3, alarm: 1 / 3, alarm_months: 1, activity: false },
};

export interface Config {
  timezone: string;
  codeword: string;

  // кредиты и встречи
  credits_max: number;
  receiver_monthly_cap: number;
  meeting_deadline_days: number;
  min_meeting_minutes: number;
  /** За сколько дней до срока напоминать о встрече (плюс всегда — в день срока). */
  meeting_reminder_days_before: number[];

  // доска
  urgent_per_month: number;
  backed_by_contribution_days: number;
  /** Новичку 60 дней отсчитываются от joined_at (иначе все новички сразу «в конце очереди»). */
  contribution_grace_from_join: boolean;
  duty_after_hours: number;
  duty_pings_required: number;
  review_max_chars: number;

  // отбор
  first_help_talk_days: number;
  probation_months: number;
  sponsor_limit_per_quarter: number;
  sponsor_gate_enabled: boolean;
  /** Когда в клубе столько участников — вход только через поручителя Партнёр+. */
  sponsor_gate_size: number;
  founders_count: number;
  refusals_to_reject: number;
  /** 'any' — ответ «отказ», если отказал хоть один проверяющий; 'both' — только если оба. */
  refuse_rule: "any" | "both";
  min_answer_chars: number;
  /** Кто может быть проверяющим анкет (id участников). */
  reviewer_pool_ids: Id[];

  // Пульс
  pulse_stop_threshold: number;
  pulse_stop_months: number;
  partner_threshold: number;
  council_threshold: number;
  active_window_days: number;

  // Совет
  council_term_months: number;
  council_max_consecutive_terms: number;
  council_term_warn_days: number;

  // метрики
  quiet_months: number[];
  thresholds: Record<MetricKey, Threshold>;
}

export const DEFAULT_CONFIG: Config = {
  timezone: "Europe/Berlin",
  codeword: "Движение",

  credits_max: 4,
  receiver_monthly_cap: 2,
  meeting_deadline_days: 14,
  min_meeting_minutes: 30,
  meeting_reminder_days_before: [3],

  urgent_per_month: 1,
  backed_by_contribution_days: 60,
  contribution_grace_from_join: true,
  duty_after_hours: 48,
  duty_pings_required: 2,
  review_max_chars: 500,

  first_help_talk_days: 14,
  probation_months: 1,
  sponsor_limit_per_quarter: 2,
  sponsor_gate_enabled: true,
  sponsor_gate_size: 30,
  founders_count: 30,
  refusals_to_reject: 2,
  refuse_rule: "any",
  min_answer_chars: 30,
  reviewer_pool_ids: [],

  pulse_stop_threshold: 20,
  pulse_stop_months: 2,
  partner_threshold: 60,
  council_threshold: 75,
  active_window_days: 30,

  council_term_months: 12,
  council_max_consecutive_terms: 2,
  council_term_warn_days: 30,

  quiet_months: [7, 8, 12],
  thresholds: DEFAULT_THRESHOLDS,
};

/** Параметры формулы Пульса, версия 1 (раздел 5 инструкции). */
export const PULSE_V1: PulseParams = {
  weight_contribution: 75,
  weight_connections: 25,
  grade_points: { 1: 1, 3: 3, 6: 6 },
  repeat_window_months: 12,
  reciprocity_factor: 0.25,
  reciprocity_window_months: 12,
  pair_cap: 8,
  pair_cap_window_months: 12,
  pair_cap_mode: "sequential",
  decay_per_month: 0.9,
  diversity_target: 6,
  contribution_divisor: 35,
  connections_window_months: 6,
  connections_divisor: 8,
};

export const GRADE_LABELS: Record<1 | 3 | 6, string> = {
  1: "мелочь",
  3: "серьёзно",
  6: "изменило ситуацию",
};

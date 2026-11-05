/**
 * Shared client-safe DTO types — the shapes the API routes return to the
 * browser. Kept free of any server-only imports so client components can use
 * them.
 */

export type Urgency = "inbox" | "today" | "week" | "later";
export type Domain = "school" | "personal" | "work" | "finance" | "akrov";

export interface TaskDTO {
  id: string;
  title: string;
  urgency: Urgency | null;
  key: boolean;
  priority_score: number | null;
  time_estimate_min: number | null;
  domain: Domain | null;
  done: boolean;
  course_id: string | null;
  course_name: string | null;
  due_date: string | null;
  due_time: string | null;
  created_at: string;
}

export interface CourseMeetingDTO {
  days: string;
  start: string;
  end: string;
  location?: string;
  label?: string;
}

export interface CourseInfoDTO {
  term?: string;
  credits?: number;
  status?: "enrolled" | "waitlisted";
  retake?: boolean;
  meetings?: CourseMeetingDTO[];
  /** Syllabus-derived reference data (School tab only). */
  instructor?: string;
  email?: string;
  office_hours?: string;
  ta?: string;
  sections?: string[];
  recitation_section?: string;
  /** Assessment label -> weight, e.g. { "Final": "30%" }. */
  grading?: Record<string, string>;
  /** Course-specific rules worth remembering (late policy, drop rules, …). */
  notes?: string;
}

export interface CourseDTO {
  id: string;
  name: string;
  /** Present for seeded schedule courses (term, credits, status, meetings). */
  info?: CourseInfoDTO | null;
}

/** Lock-in front page state (config/lockin.ts ids only — no grades, no GPA). */
export interface LockinStateDTO {
  /** YYYY-MM-DD in the operator's timezone. */
  today: string;
  /** Daily check ids ticked today. */
  daily: string[];
  /** One-time unblocker ids ticked (never roll over). */
  unblock: string[];
  /** Consecutive full days (every daily check ticked). */
  streak: number;
  /** Daily ticks since lock-in started, most recent first. */
  history: { date: string; done: string[] }[];
}

export interface HabitStateDTO {
  /** YYYY-MM-DD in the operator's timezone. */
  date: string;
  /** Habit ids marked done that day. */
  done: string[];
  /** Total configured habits that day. */
  total: number;
}

export interface GoalItem {
  text: string;
  done: boolean;
}

export interface GoalsDTO {
  week: GoalItem[];
  semester: GoalItem[];
}

export interface Milestone {
  label: string;
  done: boolean;
  /** Optional target date (YYYY-MM-DD) — shown on the Calendar when set. */
  date?: string;
}

export interface PathDTO {
  id: string;
  title: string;
  description: string | null;
  milestones: Milestone[];
  /** 0–100, derived from completed milestones. */
  progress: number;
  status: string | null;
}

export interface JournalDTO {
  id: string;
  entry_date: string;
  text: string | null;
  mood: string | null;
  source: string | null;
  summary: string | null;
  created_at: string;
  private: boolean;
}

export interface MemoryHitDTO {
  documentId: string;
  text: string;
  score: number;
  sourceType: string;
  sourceId: string;
  /** Human-readable label used for citations, e.g. "Task", "Journal", "Note". */
  sourceLabel: string;
}

export interface AskSourceDTO {
  label: string;
  sourceType: string;
  sourceId: string;
  text: string;
}

export interface AskResponseDTO {
  answer: string;
  sources: AskSourceDTO[];
}

export interface FinanceAccountDTO {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  source: string;
}

export interface CreditCardDTO {
  id: string;
  name: string;
  issuer: string | null;
  balance: number | null;
  credit_limit: number | null;
  minimum_payment: number | null;
  due_day: number | null;
  next_due_date: string | null;
  apr: number | null;
  source: string;
  /** 0–1 (balance / limit), null when no limit. */
  utilization: number | null;
  overLimit: boolean;
  dueSoon: boolean;
  dueLabel: string | null;
}

export interface SpendCategoryDTO {
  category: string;
  spent: number;
  budget: number | null;
  over: boolean;
}

export interface BudgetDTO {
  category: string;
  monthly_limit: number;
}

/** Connection health for one Plaid item — no balances, safe on both tiers. */
export interface PlaidItemHealthDTO {
  id: string;
  institution: string | null;
  status: string;
  /** True when the login must be re-authenticated via update-mode Link. */
  needsReconnect: boolean;
  /** Account labels under this login ("Savor ··7180") — names only, no balances. */
  accounts: string[];
}

export interface FinanceOverviewDTO {
  connected: boolean;
  netWorth: number;
  assets: number;
  debts: number;
  cardDebt: number;
  loanDebt: number;
  accounts: FinanceAccountDTO[];
  cards: CreditCardDTO[];
  items: PlaidItemHealthDTO[];
  spending: { month: string; total: number; categories: SpendCategoryDTO[] };
  budgets: BudgetDTO[];
  locked?: false;
}

/**
 * The shape served while the debt privacy screen is locked: assets and
 * spending only — no cards, APRs, utilization, loan totals, or net worth.
 */
export interface LockedFinanceOverviewDTO {
  locked: true;
  connected: boolean;
  assets: number;
  /** Non-debt accounts only (no loan / credit accounts). */
  accounts: FinanceAccountDTO[];
  /** Connection health only — carries no balance or debt data. */
  items: PlaidItemHealthDTO[];
  spending: { month: string; total: number; categories: SpendCategoryDTO[] };
  budgets: BudgetDTO[];
}

export type FinanceOverviewResponse = FinanceOverviewDTO | LockedFinanceOverviewDTO;

export interface KeyDate {
  label: string;
  date: string;
}

export interface ProfileDTO {
  current_city: string | null;
  target_city: string | null;
  target_date: string | null;
  occupation: string | null;
  studies: string | null;
  languages: string[];
  residency_status: string | null;
  about: string | null;
  key_dates: KeyDate[];
  facts: Record<string, unknown>;
}

export interface PlanDTO {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  milestones: Milestone[];
  progress: number;
  status: string | null;
  target_date: string | null;
  notes: string | null;
  savings_target: number | null;
  category: string | null;
  tracks?: PlanDTO[];
}

export interface ResumeDTO {
  full_text: string | null;
  structured: Record<string, unknown>;
  updated_at: string | null;
}

export type ApplicationKind = "masters" | "job" | "campus_job";
export type ApplicationStatus =
  | "researching"
  | "applying"
  | "applied"
  | "interview"
  | "decision";

export interface ApplicationDTO {
  id: string;
  kind: ApplicationKind;
  org: string | null;
  title: string | null;
  field: string | null;
  location: string | null;
  language: string | null;
  duration: string | null;
  eu_tuition: string | null;
  url: string | null;
  status: ApplicationStatus;
  deadline: string | null;
  deadline_indicative: string | null;
  test_required: string | null;
  fit_notes: string | null;
  tailored_resume: string | null;
  cover_letter: string | null;
  next_action: string | null;
  decision: string | null;
  /** Admissions realism tag (reach / target / safety). */
  realism: "reach" | "target" | "safety" | null;
}

export interface NudgeDTO {
  id: string;
  text: string;
  plan: string | null;
  plan_id: string | null;
  priority: number;
}

export interface CalendarCategoryDTO {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

export interface AkrovEmailDTO {
  id: string;
  subject: string;
  from: string | null;
  /** RFC date string as forwarded from Gmail. */
  date: string | null;
  snippet: string | null;
  status: "new" | "converted" | "dismissed";
  created_at: string;
}

export interface JobEmailDTO {
  id: string;
  subject: string;
  from: string | null;
  /** RFC date string as forwarded from Gmail. */
  date: string | null;
  snippet: string | null;
  status: "new" | "converted" | "dismissed";
  /** Application this email was matched to on ingest, if any. */
  application_id: string | null;
  matched_org: string | null;
  created_at: string;
}

export interface CalendarEventDTO {
  id: string;
  title: string;
  /** ISO datetime, or YYYY-MM-DD for all-day. */
  start: string;
  end: string | null;
  allDay: boolean;
  category: string | null;
  color: string;
  notes: string | null;
  source: string;
  source_id: string | null;
  /** Only manual events can be edited/deleted; derived + gcal are read-only. */
  editable: boolean;
}

export interface TransactionDTO {
  id: string;
  date: string | null;
  name: string;
  /** Plaid sign convention: positive = money out. */
  amount: number;
  /** Effective category (operator override wins over Plaid's). */
  category: string;
  rawCategory: string | null;
  overridden: boolean;
  /** Normalized merchant key an override applies to. */
  matchKey: string;
  pending: boolean;
  account: string | null;
}

export interface SpendingCategorySummaryDTO {
  category: string;
  label: string;
  spent: number;
  lastMonth: number;
  budget: number | null;
  over: boolean;
}

export interface SpendingInsightDTO {
  kind: "top_categories" | "subscriptions" | "large_charges";
  title: string;
  detail: string;
}

export interface SpendingResponseDTO {
  month: string;
  /** Months that have data, newest first. */
  months: string[];
  total: number;
  lastMonthTotal: number;
  categories: SpendingCategorySummaryDTO[];
  transactions: TransactionDTO[];
  insights: SpendingInsightDTO[];
}

export interface CanvasAssignmentDTO {
  id: string;
  name: string;
  dueAt: string | null;
  points: number | null;
  kind: "assignment" | "quiz" | "exam" | "project";
  submitted: boolean;
  graded: boolean;
  score: number | null;
  url: string | null;
}

export interface CanvasCourseDTO {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  score: number | null;
  grade: string | null;
  assignments: CanvasAssignmentDTO[];
}

// ---------------------------------------------------------------------------
// Fitness — workouts mirrored from the external lifting app.
// ---------------------------------------------------------------------------

export interface WorkoutDTO {
  id: string;
  source: string;
  name: string;
  type: string | null;
  performed_at: string;
  duration_min: number | null;
  notes: string | null;
  external_id: string | null;
}

// ---------------------------------------------------------------------------
// Assistant knowledge base (edited on the Me tab). `tier` gates
// privacy: 'private' items are advisor-only — never Home, résumé, public nudges,
// or exports. The Me-tab editor manages these.
// ---------------------------------------------------------------------------

export type KnowledgeTier = "public" | "private";

export interface KnowledgeItemDTO {
  id: string;
  section: string;
  content: string;
  tier: KnowledgeTier;
  sort: number;
}

// ---------------------------------------------------------------------------
// Daily Rhythm, Meditation, Reading (Parts 2 & 4). Neutral routine + practice
// logs — no health context, no advice.
// ---------------------------------------------------------------------------

/** One editable block of the daily routine. `days` [] = every day. */
export interface RhythmBlockDTO {
  id: string;
  at_time: string | null;
  label: string;
  detail: string | null;
  kind: string | null;
  days: string[];
  sort: number;
  active: boolean;
}

/** GET /api/rhythm/checkins — this week's Telegram check-in tally (lib/rhythmPings). */
export interface CheckinStatsDTO {
  since: string;
  asked: number;
  done: number;
  partial: number;
  skipped: number;
  unanswered: number;
  today: Record<string, "done" | "partial" | "skipped">;
}

export interface MeditationSessionDTO {
  id: string;
  session_date: string;
  duration_sec: number;
  note: string | null;
}

export interface MeditationStatsDTO {
  /** Consecutive days ending today (or yesterday) with a session. */
  streak: number;
  /** Sessions logged in the last 7 local days. */
  sessionsThisWeek: number;
  totalMinutes: number;
  today: boolean;
  recent: MeditationSessionDTO[];
}

export type ReadingStatus = "want" | "reading" | "finished";

export interface ReadingBookDTO {
  id: string;
  title: string;
  author: string | null;
  status: ReadingStatus;
  current_page: number | null;
  total_pages: number | null;
  /** 0–100, derived from pages when present else the stored percent. */
  progress: number | null;
  notes: string | null;
  started_on: string | null;
  finished_on: string | null;
}

export interface ReadingListDTO {
  books: ReadingBookDTO[];
  finishedCount: number;
}

export type CaptureRoute =
  | "task"
  | "event"
  | "journal"
  | "note"
  | "personal"
  | "plan"
  | "reading"
  | "application";


export interface CaptureResultDTO {
  routedTo: CaptureRoute;
  label: string;
  pending?: boolean;
  itemCount?: number;
}

/** Wish list (Money → Wishlist, lib/wishlist). */
export interface WishlistItemDTO {
  id: string;
  name: string;
  for_whom: string | null;
  price: number | null;
  target_price: number | null;
  link: string | null;
  notes: string | null;
  choice_group: string | null;
  priority: number;
  status: "wanting" | "bought" | "dropped";
  bought_price: number | null;
  bought_at: string | null;
  created_at: string;
}

export interface WishlistResponseDTO {
  items: WishlistItemDTO[];
  status: { month: string; cap: number; spent: number; remaining: number };
}

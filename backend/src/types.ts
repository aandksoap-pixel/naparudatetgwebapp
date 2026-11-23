/**
 * Типы данных backend.
 *
 * Разделены на два слоя:
 *  - *Row — строки таблиц Supabase в snake_case (как в supabase/schema.sql);
 *  - API-типы — camelCase-контракт из docs/BUILD_SPEC.md (раздел 5.1).
 */

// ---------------------------------------------------------------------------
// Базовые перечисления
// ---------------------------------------------------------------------------

export type PlanType = 'free' | 'trial' | 'pro_monthly' | 'pro_yearly';

/** План, который оплачивается: месяц или год. */
export type PaymentPlan = 'monthly' | 'yearly';

export type Category = 'movie' | 'food';

export type SwipeDirection = 'left' | 'right';

export type MoodStatus =
  | 'hugs'
  | 'tired'
  | 'snack'
  | 'playful'
  | 'stressed'
  | 'chill'
  | 'adventure'
  | 'miss';

export interface MoodPreset {
  status: MoodStatus;
  emoji: string;
  label: string;
}

/** Пресеты настроения — используются в уведомлениях бота и на фронтенде. */
export const MOOD_PRESETS: readonly MoodPreset[] = [
  { status: 'hugs', emoji: '🥰', label: 'Хочу обнимашек' },
  { status: 'tired', emoji: '🔋', label: 'На нуле, нужен отдых' },
  { status: 'snack', emoji: '🍕', label: 'Хочу вкусняшку' },
  { status: 'playful', emoji: '🔥', label: 'Игривое настроение' },
  { status: 'stressed', emoji: '😤', label: 'Стресс / не трогать' },
  { status: 'chill', emoji: '🎬', label: 'Хочу чиллить' },
  { status: 'adventure', emoji: '🚀', label: 'Готов(а) к движу' },
  { status: 'miss', emoji: '🥺', label: 'Скучаю' },
];

export function findMoodPreset(status: MoodStatus): MoodPreset | null {
  return MOOD_PRESETS.find((preset) => preset.status === status) ?? null;
}

// ---------------------------------------------------------------------------
// Строки таблиц (snake_case)
// ---------------------------------------------------------------------------

export interface UserRow {
  id: number;
  username: string | null;
  first_name: string;
  avatar_url: string | null;
  pair_id: string | null;
  mood_status: MoodStatus;
  mood_text: string | null;
  mood_updated_at: string;
  mood_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PairRow {
  id: string;
  invite_code: string;
  user1_id: number;
  user2_id: number | null;
  relationship_start_date: string | null;
  plan_type: PlanType;
  trial_used: boolean;
  subscription_expires_at: string | null;
  paid_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DailyUsageRow {
  id: string;
  pair_id: string;
  usage_date: string;
  movie_swipes_count: number;
  food_swipes_count: number;
  reminders_sent_count: number;
  created_at: string;
  updated_at: string;
}

export interface SwipeRow {
  id: string;
  pair_id: string;
  user_id: number;
  category: Category;
  item_id: string;
  item_title: string;
  item_poster: string;
  direction: SwipeDirection;
  created_at: string;
}

export interface MatchRow {
  id: string;
  pair_id: string;
  category: Category;
  item_id: string;
  item_title: string;
  item_poster: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface ReminderRow {
  id: string;
  pair_id: string;
  sender_id: number;
  receiver_id: number;
  text: string;
  remind_at: string;
  is_sent: boolean;
  is_done: boolean;
  sent_at: string | null;
  done_at: string | null;
  send_attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  pair_id: string;
  user_id: number | null;
  provider: 'telegram_stars' | 'yookassa';
  provider_payment_id: string;
  plan: PaymentPlan;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'canceled';
  raw: Record<string, unknown>;
  created_at: string;
  paid_at: string | null;
}

// ---------------------------------------------------------------------------
// Результаты RPC (jsonb-ответы из supabase/schema.sql)
// ---------------------------------------------------------------------------

export interface CreatePairResult {
  pair: PairRow;
  created: boolean;
}

export interface JoinPairResult {
  pair: PairRow;
  partner: UserRow | null;
  joined: boolean;
}

export interface LeavePairResult {
  had_pair: boolean;
  pair_id: string | null;
  partner_id: number | null;
}

export interface SetMoodResult {
  user: UserRow;
  should_notify: boolean;
}

export interface ProcessSwipeResult {
  swipe: SwipeRow;
  match: MatchRow | null;
  is_match: boolean;
  new_match: boolean;
  usage: DailyUsageRow;
  is_pro: boolean;
}

export interface CreateReminderResult {
  reminder: ReminderRow;
  usage: DailyUsageRow;
  is_pro: boolean;
}

export interface MarkReminderDoneResult {
  reminder: ReminderRow;
  sender_id: number;
  already_done: boolean;
}

export interface ActivateTrialResult {
  pair: PairRow;
  already_active: boolean;
}

export interface ActivatePaidPlanResult {
  pair: PairRow;
  payment: PaymentRow;
  already_processed: boolean;
}

export interface ExpiredSubscriptionRow {
  pair_id: string;
  user1_id: number;
  user2_id: number | null;
  previous_plan: PlanType;
}

// ---------------------------------------------------------------------------
// API-типы (camelCase, контракт с frontend)
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: number;
  username: string | null;
  firstName: string;
  avatarUrl: string | null;
  moodStatus: MoodStatus;
  moodText: string | null;
  moodUpdatedAt: string;
}

export interface PairInfo {
  id: string;
  inviteCode: string;
  inviteLink: string;
  relationshipStartDate: string | null;
  planType: PlanType;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  paidByUserId: number | null;
  createdAt: string;
  daysTogether: number | null;
}

export interface SubscriptionInfo {
  plan: PlanType;
  isPro: boolean;
  isTrial: boolean;
  trialUsed: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
}

export interface UsageInfo {
  date: string;
  movieSwipesCount: number;
  foodSwipesCount: number;
  remindersSentCount: number;
}

export interface LimitInfo {
  used: number;
  limit: number | null;
}

export interface LimitsInfo {
  isUnlimited: boolean;
  movie: LimitInfo;
  food: LimitInfo;
  reminders: LimitInfo;
}

export interface MatchInfo {
  id: string;
  category: Category;
  itemId: string;
  itemTitle: string;
  itemPoster: string;
  isCompleted: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface ReminderInfo {
  id: string;
  senderId: number;
  receiverId: number;
  text: string;
  remindAt: string;
  isSent: boolean;
  isDone: boolean;
  createdAt: string;
  sentAt: string | null;
  doneAt: string | null;
}

export interface MovieCard {
  id: string;
  category: 'movie';
  title: string;
  originalTitle: string | null;
  overview: string;
  poster: string;
  year: number | null;
  rating: number;
  genres: string[];
}

export interface FoodCard {
  id: string;
  category: 'food';
  title: string;
  cuisine: string;
  tags: string[];
  description: string;
  photo: string;
  emoji: string;
}

export type SwipeItem = MovieCard | FoodCard;

export interface AppState {
  user: UserProfile;
  partner: UserProfile | null;
  pair: PairInfo | null;
  subscription: SubscriptionInfo;
  limits: LimitsInfo;
  usage: UsageInfo;
  matches: MatchInfo[];
  reminders: ReminderInfo[];
  mySwipes: { movie: string[]; food: string[] };
  serverTime: string;
}

export interface RealtimeCredentials {
  url: string;
  anonKey: string;
  token: string;
}

export interface PublicConfig {
  botUsername: string;
  miniAppUrl: string;
  trialDays: number;
  prices: {
    monthlyRub: number;
    yearlyRub: number;
    starsMonthly: number;
    starsYearly: number;
  };
}

export interface SessionResponse {
  state: AppState;
  realtime: RealtimeCredentials;
  config: PublicConfig;
  notice?: string;
}

/** Ответы конкретных эндпоинтов. */
export interface StateResponse {
  state: AppState;
}

export interface SwipeResponse {
  state: AppState;
  match: MatchInfo | null;
  isMatch: boolean;
  newMatch: boolean;
}

export interface MoodResponse {
  state: AppState;
  notifiedPartner: boolean;
}

export interface ReminderCreateResponse {
  state: AppState;
  reminder: ReminderInfo;
}

export interface ReminderDoneResponse {
  state: AppState;
  reminder: ReminderInfo;
}

export interface SubscriptionSyncResponse {
  state: AppState;
  pending: boolean;
}

export interface StarsInvoiceResponse {
  invoiceLink: string;
}

export interface YookassaPaymentResponse {
  confirmationUrl: string;
  paymentId: string;
}

export interface MoviesResponse {
  items: MovieCard[];
  source: 'tmdb' | 'fallback';
}

export interface FoodResponse {
  items: FoodCard[];
  source: 'local';
}

export interface HealthResponse {
  ok: boolean;
  db: boolean;
  uptime: number;
}

export interface CronTickResponse {
  ok: boolean;
  remindersClaimed: number;
  subscriptionsExpired: number;
}

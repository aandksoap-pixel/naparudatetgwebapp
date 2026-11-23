/**
 * Типы API-контракта «Пространство для двоих».
 * Backend отдаёт JSON в camelCase; этот файл — единственный источник правды
 * для frontend-части.
 */

export type PlanType = 'free' | 'trial' | 'pro_monthly' | 'pro_yearly';
export type Category = 'movie' | 'food';
export type MoodStatus =
  | 'hugs'
  | 'tired'
  | 'snack'
  | 'playful'
  | 'stressed'
  | 'chill'
  | 'adventure'
  | 'miss';

export type SwipeDirection = 'left' | 'right';
export type PaymentPlan = 'monthly' | 'yearly';

/** Причина открытия Paywall. */
export type PaywallReason = 'movie' | 'food' | 'reminder' | 'upsell';

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
  relationshipStartDate: string | null; // YYYY-MM-DD
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
  id: string; // tmdb_<id>
  category: 'movie';
  title: string;
  originalTitle: string | null;
  overview: string;
  poster: string; // пустая строка => styled fallback
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

/* ------------------------------------------------------------------ */
/* Формы ответов отдельных эндпоинтов                                  */
/* ------------------------------------------------------------------ */

export interface StateResponse {
  state: AppState;
}

export interface MoodResponse {
  state: AppState;
  notifiedPartner: boolean;
}

export interface SwipeResponse {
  state: AppState;
  match: MatchInfo | null;
  isMatch: boolean;
  newMatch: boolean;
}

export interface ReminderResponse {
  state: AppState;
  reminder: ReminderInfo;
}

export interface StarsInvoiceResponse {
  invoiceLink: string;
}

export interface YookassaResponse {
  confirmationUrl: string;
  paymentId: string;
}

export interface SubscriptionSyncResponse {
  state: AppState;
  pending: boolean;
}

export interface ContentResponse<T> {
  items: T[];
  source: 'tmdb' | 'fallback' | 'local';
}

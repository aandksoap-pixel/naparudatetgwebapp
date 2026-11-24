/**
 * Сборка AppState — единого снимка данных для Mini App.
 *
 * Здесь же собраны общие запросы к таблицам (пользователь, пара, участники),
 * которые используют остальные сервисы.
 */
import { config } from '../config.js';
import { isAdminUser } from '../lib/admin.js';
import { appErrors, mapDbError } from '../lib/errors.js';
import { daysLeftUntil, daysTogether, moscowDateString } from '../lib/moscow.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type {
  AppState,
  DailyUsageRow,
  LimitsInfo,
  LoveMessageInfo,
  LoveMessageRow,
  MatchInfo,
  MatchRow,
  PairInfo,
  PairRow,
  ReminderInfo,
  ReminderRow,
  SubscriptionInfo,
  SwipeRow,
  UsageInfo,
  UserProfile,
  UserRow,
} from '../types.js';

/** Лимиты FREE-тарифа на пару в сутки (сброс в 00:00 МСК). */
export const FREE_LIMITS = {
  movie: 5,
  food: 2,
  reminders: 3,
} as const;

const HISTORY_LIMIT = 100;

// ---------------------------------------------------------------------------
// Общие выборки
// ---------------------------------------------------------------------------

export async function getUserRow(userId: number): Promise<UserRow> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) {
    throw appErrors.invalidInitData('Пользователь не найден. Переоткройте приложение.');
  }
  return data as UserRow;
}

export async function getPairRow(pairId: string): Promise<PairRow | null> {
  const { data, error } = await supabaseAdmin
    .from('pairs')
    .select('*')
    .eq('id', pairId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return (data as PairRow | null) ?? null;
}

export async function getPartnerRow(pairId: string, userId: number): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('pair_id', pairId)
    .neq('id', userId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return (data as UserRow | null) ?? null;
}

export async function getPairParticipants(pairId: string): Promise<UserRow[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('pair_id', pairId);
  if (error) throw mapDbError(error);
  return (data ?? []) as UserRow[];
}

/** Telegram id участников пары — для уведомлений ботом. */
export async function getPairParticipantIds(pairId: string): Promise<number[]> {
  const participants = await getPairParticipants(pairId);
  return participants.map((participant) => participant.id);
}

async function getUsageRow(pairId: string, date: string): Promise<DailyUsageRow | null> {
  const { data, error } = await supabaseAdmin
    .from('daily_usage')
    .select('*')
    .eq('pair_id', pairId)
    .eq('usage_date', date)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return (data as DailyUsageRow | null) ?? null;
}

async function listMatches(pairId: string): Promise<MatchRow[]> {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw mapDbError(error);
  return (data ?? []) as MatchRow[];
}

async function listLoveMessages(pairId: string): Promise<LoveMessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from('love_messages')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw mapDbError(error);
  return (data ?? []) as LoveMessageRow[];
}

async function listReminders(pairId: string): Promise<ReminderRow[]> {
  const { data, error } = await supabaseAdmin
    .from('reminders')
    .select('*')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw mapDbError(error);
  return (data ?? []) as ReminderRow[];
}

async function listMySwipes(
  pairId: string,
  userId: number,
): Promise<{ movie: string[]; food: string[] }> {
  const { data, error } = await supabaseAdmin
    .from('swipes')
    .select('category, item_id')
    .eq('pair_id', pairId)
    .eq('user_id', userId);
  if (error) throw mapDbError(error);
  const rows = (data ?? []) as Pick<SwipeRow, 'category' | 'item_id'>[];
  const result: { movie: string[]; food: string[] } = { movie: [], food: [] };
  for (const row of rows) {
    if (row.category === 'movie') result.movie.push(row.item_id);
    else if (row.category === 'food') result.food.push(row.item_id);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Маппинг snake_case → camelCase
// ---------------------------------------------------------------------------

export function toUserProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    avatarUrl: row.avatar_url,
    moodStatus: row.mood_status,
    moodText: row.mood_text,
    moodUpdatedAt: row.mood_updated_at,
  };
}

export function toMatchInfo(row: MatchRow): MatchInfo {
  return {
    id: row.id,
    category: row.category,
    itemId: row.item_id,
    itemTitle: row.item_title,
    itemPoster: row.item_poster,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function toLoveMessageInfo(row: LoveMessageRow): LoveMessageInfo {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function toReminderInfo(row: ReminderRow): ReminderInfo {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text,
    remindAt: row.remind_at,
    isSent: row.is_sent,
    isDone: row.is_done,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    doneAt: row.done_at,
  };
}

// ---------------------------------------------------------------------------
// Подписка и лимиты
// ---------------------------------------------------------------------------

export function computeSubscription(pair: PairRow | null): SubscriptionInfo {
  if (!pair) {
    return {
      plan: 'free',
      isPro: false,
      isTrial: false,
      trialUsed: false,
      expiresAt: null,
      daysLeft: null,
    };
  }
  const now = Date.now();
  const expiresAt = pair.subscription_expires_at;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const isActive =
    pair.plan_type !== 'free' && Number.isFinite(expiresMs) && expiresMs > now;

  return {
    plan: isActive ? pair.plan_type : 'free',
    isPro: isActive,
    isTrial: isActive && pair.plan_type === 'trial',
    trialUsed: pair.trial_used,
    expiresAt: isActive ? expiresAt : null,
    daysLeft: isActive && expiresAt ? daysLeftUntil(expiresAt, now) : null,
  };
}

function computeLimits(subscription: SubscriptionInfo, usage: UsageInfo): LimitsInfo {
  return {
    isUnlimited: subscription.isPro,
    movie: {
      used: usage.movieSwipesCount,
      limit: subscription.isPro ? null : FREE_LIMITS.movie,
    },
    food: {
      used: usage.foodSwipesCount,
      limit: subscription.isPro ? null : FREE_LIMITS.food,
    },
    reminders: {
      used: usage.remindersSentCount,
      limit: subscription.isPro ? null : FREE_LIMITS.reminders,
    },
  };
}

function toPairInfo(pair: PairRow, subscription: SubscriptionInfo, today: string): PairInfo {
  return {
    id: pair.id,
    inviteCode: pair.invite_code,
    // ?start= открывает бота и сразу обрабатывает join в /start.
    // ?startapp= требует зарегистрированного Main Mini App в BotFather,
    // поэтому для надёжности используем обычный deep-link бота.
    inviteLink: `https://t.me/${config.telegram.botUsername}?start=join_${pair.invite_code}`,
    relationshipStartDate: pair.relationship_start_date,
    planType: subscription.plan,
    trialUsed: pair.trial_used,
    subscriptionExpiresAt: subscription.expiresAt,
    paidByUserId: pair.paid_by_user_id,
    createdAt: pair.created_at,
    daysTogether: daysTogether(pair.relationship_start_date, today),
  };
}

// ---------------------------------------------------------------------------
// buildState
// ---------------------------------------------------------------------------

export async function buildState(userId: number): Promise<AppState> {
  const user = await getUserRow(userId);
  const pair = user.pair_id ? await getPairRow(user.pair_id) : null;
  // Дата Москвы считается локально: не тратим ещё один сетевой round-trip.
  const today = moscowDateString();

  const [partner, usageRow, matchRows, reminderRows, loveRows, mySwipes] = pair
    ? await Promise.all([
        getPartnerRow(pair.id, userId),
        getUsageRow(pair.id, today),
        listMatches(pair.id),
        listReminders(pair.id),
        listLoveMessages(pair.id),
        listMySwipes(pair.id, userId),
      ])
    : [
        null,
        null,
        [] as MatchRow[],
        [] as ReminderRow[],
        [] as LoveMessageRow[],
        { movie: [], food: [] },
      ];

  const subscription = computeSubscription(pair);
  const usage: UsageInfo = {
    date: usageRow?.usage_date ?? today,
    movieSwipesCount: usageRow?.movie_swipes_count ?? 0,
    foodSwipesCount: usageRow?.food_swipes_count ?? 0,
    remindersSentCount: usageRow?.reminders_sent_count ?? 0,
  };

  return {
    user: toUserProfile(user),
    partner: partner ? toUserProfile(partner) : null,
    pair: pair ? toPairInfo(pair, subscription, today) : null,
    subscription,
    limits: computeLimits(subscription, usage),
    usage,
    matches: matchRows.map(toMatchInfo),
    reminders: reminderRows.map(toReminderInfo),
    loveMessages: loveRows.map(toLoveMessageInfo),
    mySwipes,
    isAdmin: isAdminUser(userId),
    serverTime: new Date().toISOString(),
  };
}

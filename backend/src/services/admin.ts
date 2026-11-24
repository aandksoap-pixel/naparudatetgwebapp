/**
 * Админ-аналитика и ручная выдача/отзыв PRO.
 * Доступ проверяется на уровне маршрутов по Telegram ID.
 */
import { mapDbError } from '../lib/errors.js';
import { moscowDateString } from '../lib/moscow.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type {
  AdminGrantRow,
  AdminGrantView,
  AdminOverview,
  AdminPaymentView,
  AdminUserView,
  AdminStats,
  PairRow,
  PaymentRow,
  PlanType,
  UserRow,
} from '../types.js';
import { computeSubscription } from './state.js';

const HISTORY_LIMIT = 500;

async function loadUsers(): Promise<UserRow[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw mapDbError(error);
  return (data ?? []) as UserRow[];
}

async function loadPairs(): Promise<PairRow[]> {
  const { data, error } = await supabaseAdmin
    .from('pairs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw mapDbError(error);
  return (data ?? []) as PairRow[];
}

async function loadPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw mapDbError(error);
  return (data ?? []) as PaymentRow[];
}

async function loadGrants(): Promise<AdminGrantRow[]> {
  const { data, error } = await supabaseAdmin
    .from('admin_grants')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw mapDbError(error);
  return (data ?? []) as AdminGrantRow[];
}

function toAdminUser(
  user: UserRow,
  pairs: Map<string, PairRow>,
  users: UserRow[],
  today: string,
): AdminUserView {
  const pair = user.pair_id ? pairs.get(user.pair_id) ?? null : null;
  const subscription = computeSubscription(pair);
  const partner = pair
    ? users.find((candidate) => candidate.pair_id === pair.id && candidate.id !== user.id)
    : null;

  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    avatarUrl: user.avatar_url,
    pairId: user.pair_id,
    partnerName: partner?.first_name ?? null,
    plan: subscription.plan,
    isPro: subscription.isPro,
    trialUsed: subscription.trialUsed,
    expiresAt: subscription.expiresAt,
    daysLeft: subscription.daysLeft,
    lastSeenAt: user.last_seen_at,
    createdAt: user.created_at,
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [users, pairs, payments, grants] = await Promise.all([
    loadUsers(),
    loadPairs(),
    loadPayments(),
    loadGrants(),
  ]);

  const pairsMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const today = moscowDateString();
  const now = Date.now();

  const activePairs = pairs.filter((pair) => {
    if (pair.plan_type === 'free' || !pair.subscription_expires_at) return false;
    return Date.parse(pair.subscription_expires_at) > now;
  });

  const stats: AdminStats = {
    totalUsers: users.length,
    totalPairs: pairs.length,
    activePro: activePairs.filter((pair) => pair.plan_type !== 'trial').length,
    activeTrial: activePairs.filter((pair) => pair.plan_type === 'trial').length,
    freePairs: Math.max(0, pairs.length - activePairs.length),
    loginsToday: users.filter((user) => moscowDateString(new Date(user.last_seen_at)) === today).length,
    paymentsCount: payments.filter((payment) => payment.status === 'succeeded').length,
    starsRevenue: payments
      .filter((payment) => payment.status === 'succeeded' && payment.currency === 'XTR')
      .reduce((sum, payment) => sum + Number(payment.amount), 0),
  };

  const userById = new Map(users.map((user) => [user.id, user]));

  return {
    stats,
    users: users.map((user) => toAdminUser(user, pairsMap, users, today)),
    payments: payments.map<AdminPaymentView>((payment) => ({
      id: payment.id,
      pairId: payment.pair_id,
      userName: payment.user_id ? userById.get(payment.user_id)?.first_name ?? null : null,
      plan: payment.plan,
      provider: payment.provider,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    })),
    grants: grants.map<AdminGrantView>((grant) => ({
      id: grant.id,
      adminId: grant.admin_id,
      adminName: grant.admin_id ? userById.get(grant.admin_id)?.first_name ?? null : null,
      pairId: grant.pair_id,
      targetUserId: grant.target_user_id,
      targetName: grant.target_user_id
        ? userById.get(grant.target_user_id)?.first_name ?? null
        : null,
      planType: grant.plan_type,
      durationDays: grant.duration_days,
      expiresAt: grant.expires_at,
      note: grant.note,
      createdAt: grant.created_at,
    })),
    serverTime: new Date().toISOString(),
  };
}

export interface GrantInput {
  adminId: number;
  pairId?: string;
  userId?: number;
  duration: 'month' | 'year' | 'forever' | 'custom' | 'trial';
  days?: number;
  note?: string | null;
}

export interface GrantResult {
  pair: PairRow;
  grant: AdminGrantRow;
}

function durationDays(input: GrantInput): number {
  if (input.duration === 'month') return 30;
  if (input.duration === 'year') return 365;
  if (input.duration === 'trial') return 2;
  if (input.duration === 'forever') return 36500;
  const days = input.days ?? 0;
  if (!Number.isInteger(days) || days < 1 || days > 36500) {
    throw new Error('INVALID_DURATION');
  }
  return days;
}

function planFor(duration: GrantInput['duration'], days: number): PlanType {
  if (duration === 'trial') return 'trial';
  return days <= 31 ? 'pro_monthly' : 'pro_yearly';
}

export async function grantPro(input: GrantInput): Promise<GrantResult> {
  let pair: PairRow | null = null;
  let targetUserId = input.userId ?? null;

  if (input.pairId) {
    const { data, error } = await supabaseAdmin
      .from('pairs')
      .select('*')
      .eq('id', input.pairId)
      .maybeSingle();
    if (error) throw mapDbError(error);
    pair = (data as PairRow | null) ?? null;
  } else if (input.userId) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('pair_id')
      .eq('id', input.userId)
      .maybeSingle();
    if (error) throw mapDbError(error);
    const pairId = (data as { pair_id: string | null } | null)?.pair_id ?? null;
    if (pairId) {
      const { data: pairData, error: pairError } = await supabaseAdmin
        .from('pairs')
        .select('*')
        .eq('id', pairId)
        .maybeSingle();
      if (pairError) throw mapDbError(pairError);
      pair = (pairData as PairRow | null) ?? null;
    }
  }

  if (!pair) throw new Error('PAIR_NOT_FOUND');

  const days = durationDays(input);
  const now = Date.now();
  const currentExpiry = pair.subscription_expires_at
    ? Date.parse(pair.subscription_expires_at)
    : Number.NaN;
  const base = Number.isFinite(currentExpiry) && currentExpiry > now ? currentExpiry : now;
  const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
  const plan = planFor(input.duration, days);

  const { data: updatedPair, error: updateError } = await supabaseAdmin
    .from('pairs')
    .update({
      plan_type: plan,
      subscription_expires_at: expiresAt,
      paid_by_user_id: null,
    })
    .eq('id', pair.id)
    .select('*')
    .single();
  if (updateError) throw mapDbError(updateError);

  const { data: grant, error: grantError } = await supabaseAdmin
    .from('admin_grants')
    .insert({
      admin_id: input.adminId,
      pair_id: pair.id,
      target_user_id: targetUserId,
      plan_type: plan,
      duration_days: days,
      expires_at: expiresAt,
      note: input.note ?? null,
    })
    .select('*')
    .single();

  if (grantError) throw mapDbError(grantError);

  return { pair: updatedPair as PairRow, grant: grant as AdminGrantRow };
}

export interface RevokeInput {
  adminId: number;
  pairId: string;
  note?: string | null;
}

export async function revokePro(input: RevokeInput): Promise<{ pair: PairRow; grant: AdminGrantRow }> {
  const { data: pair, error: pairError } = await supabaseAdmin
    .from('pairs')
    .select('*')
    .eq('id', input.pairId)
    .maybeSingle();
  if (pairError) throw mapDbError(pairError);
  if (!pair) throw new Error('PAIR_NOT_FOUND');

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('pairs')
    .update({ plan_type: 'free', subscription_expires_at: null })
    .eq('id', input.pairId)
    .select('*')
    .single();
  if (updateError) throw mapDbError(updateError);

  const { data: grant, error: grantError } = await supabaseAdmin
    .from('admin_grants')
    .insert({
      admin_id: input.adminId,
      pair_id: input.pairId,
      target_user_id: null,
      plan_type: 'free',
      duration_days: null,
      expires_at: null,
      note: input.note ?? 'Отозвано администратором',
    })
    .select('*')
    .single();
  if (grantError) throw mapDbError(grantError);

  return { pair: updated as PairRow, grant: grant as AdminGrantRow };
}

/**
 * Подписка: триал, публичная конфигурация цен, синхронизация pending-платежей
 * ЮKassa и истечение подписок.
 */
import { config } from '../config.js';
import { mapDbError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { callRpc, supabaseAdmin } from '../lib/supabase.js';
import type {
  ActivateTrialResult,
  ExpiredSubscriptionRow,
  PairRow,
  PaymentRow,
  PublicConfig,
} from '../types.js';
import { notifySubscriptionExpired, notifyTrialActivated } from './notifications.js';
import { getPartnerRow, getUserRow } from './state.js';
import { activateYookassaPayment, getYookassaPayment, markPaymentCanceled } from './payments/yookassa.js';

export interface TrialActivationOutcome {
  pair: PairRow;
  alreadyActive: boolean;
}

export async function activateTrial(userId: number): Promise<TrialActivationOutcome> {
  const result = await callRpc<ActivateTrialResult>('app_activate_trial', {
    p_user_id: userId,
  });

  if (!result.already_active) {
    const user = await getUserRow(userId).catch(() => null);
    if (user) {
      const partner = await getPartnerRow(result.pair.id, userId).catch(() => null);
      if (partner) {
        await notifyTrialActivated(partner.id, user.first_name, config.trialDays);
      }
    }
  }

  return { pair: result.pair, alreadyActive: result.already_active };
}

export function getPublicConfig(): PublicConfig {
  return {
    botUsername: config.telegram.botUsername,
    miniAppUrl: config.miniAppUrl,
    trialDays: config.trialDays,
    prices: {
      monthlyRub: config.payment.priceMonthlyRub,
      yearlyRub: config.payment.priceYearlyRub,
      starsMonthly: config.payment.starsMonthly,
      starsYearly: config.payment.starsYearly,
    },
  };
}

export interface SyncPaymentsResult {
  pending: boolean;
  activated: number;
}

/**
 * Проверяет pending-платежи ЮKassa пары (не более 3), активирует успешные.
 * Используется кнопкой «Проверить оплату» и поллингом на фронтенде.
 */
export async function syncPendingPayments(userId: number): Promise<SyncPaymentsResult> {
  const user = await getUserRow(userId);
  if (!user.pair_id) {
    return { pending: false, activated: 0 };
  }
  const pairId = user.pair_id;

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('pair_id', pairId)
    .eq('provider', 'yookassa')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) throw mapDbError(error);

  const pendingPayments = (data ?? []) as PaymentRow[];
  let activated = 0;

  for (const payment of pendingPayments) {
    try {
      const remote = await getYookassaPayment(payment.provider_payment_id);
      if (remote.status === 'succeeded') {
        const result = await activateYookassaPayment(remote);
        if (!result.alreadyProcessed) activated += 1;
      } else if (remote.status === 'canceled') {
        await markPaymentCanceled(payment.provider_payment_id);
      }
    } catch (error) {
      logger.warn(
        { err: error, paymentId: payment.provider_payment_id },
        'Не удалось синхронизировать платёж ЮKassa',
      );
    }
  }

  const { count, error: countError } = await supabaseAdmin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('pair_id', pairId)
    .eq('provider', 'yookassa')
    .eq('status', 'pending');

  if (countError) {
    logger.warn({ err: countError }, 'Не удалось посчитать pending-платежи');
  }

  return { pending: (count ?? 0) > 0, activated };
}

/** Забирает истёкшие подписки (RPC app_expire_subscriptions) и уведомляет обоих. */
export async function expireSubscriptions(): Promise<number> {
  const rows = await callRpc<ExpiredSubscriptionRow[] | null>('app_expire_subscriptions', {});
  const expired = Array.isArray(rows) ? rows : [];

  for (const row of expired) {
    const participantIds = [row.user1_id, row.user2_id].filter(
      (value): value is number => typeof value === 'number' && value > 0,
    );
    if (participantIds.length > 0) {
      await notifySubscriptionExpired(participantIds);
    }
  }

  return expired.length;
}

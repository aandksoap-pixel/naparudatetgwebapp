/**
 * Подписка: триал, публичная конфигурация цен и истечение подписок.
 * Оплата — только Telegram Stars; ЮKassa/СБП удалены.
 */
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { callRpc } from '../lib/supabase.js';
import type {
  ActivateTrialResult,
  ExpiredSubscriptionRow,
  PairRow,
  PublicConfig,
} from '../types.js';
import { notifySubscriptionExpired, notifyTrialActivated } from './notifications.js';
import { getPartnerRow, getUserRow } from './state.js';

export interface TrialActivationOutcome {
  pair: PairRow;
  alreadyActive: boolean;
}

export async function activateTrial(userId: number): Promise<TrialActivationOutcome> {
  const result = await callRpc<ActivateTrialResult>('app_activate_trial', {
    p_user_id: userId,
  });

  if (!result.already_active) {
    // Не задерживаем активацию триала ожиданием Telegram API.
    void (async () => {
      const user = await getUserRow(userId).catch(() => null);
      if (!user) return;
      const partner = await getPartnerRow(result.pair.id, userId).catch(() => null);
      if (partner) await notifyTrialActivated(partner.id, user.first_name, config.trialDays);
    })().catch((error: unknown) => {
      logger.warn({ err: error, userId }, 'Не удалось отправить пуш об активации триала');
    });
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

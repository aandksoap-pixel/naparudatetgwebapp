/**
 * ЮKassa: создание платежа (REST /v3/payments), перепроверка статуса
 * через GET /v3/payments/{id}, идемпотентная активация через RPC.
 *
 * Webhook никогда не считается доверенным: статус платежа всегда
 * перепроверяется отдельным запросом к API ЮKassa.
 */
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { appErrors, mapDbError } from '../../lib/errors.js';
import { HttpError, fetchJson } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { callRpc, supabaseAdmin } from '../../lib/supabase.js';
import type { ActivatePaidPlanResult, PaymentPlan } from '../../types.js';
import { notifyPaymentSuccess } from '../notifications.js';
import { getPairParticipantIds, getPairRow, getUserRow } from '../state.js';

const API_BASE = 'https://api.yookassa.ru/v3';
const REQUEST_TIMEOUT_MS = 15_000;

export interface YookassaAmount {
  value: string;
  currency: string;
}

export interface YookassaPaymentObject {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid?: boolean;
  amount?: YookassaAmount;
  metadata?: Record<string, string>;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
  description?: string;
  created_at?: string;
}

export interface CreatedYookassaPayment {
  confirmationUrl: string;
  paymentId: string;
}

export function priceRubForPlan(plan: PaymentPlan): number {
  return plan === 'monthly' ? config.payment.priceMonthlyRub : config.payment.priceYearlyRub;
}

export function formatRubAmount(amount: number): string {
  return amount.toFixed(2);
}

function authHeader(): string {
  const { shopId, secretKey } = config.yookassa;
  if (!shopId || !secretKey) {
    throw appErrors.internal('Оплата картой временно недоступна');
  }
  const credentials = Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64');
  return `Basic ${credentials}`;
}

/** Создаёт платёж в ЮKassa и pending-запись в payments. */
export async function createYookassaPayment(
  userId: number,
  plan: PaymentPlan,
): Promise<CreatedYookassaPayment> {
  const user = await getUserRow(userId);
  if (!user.pair_id) throw appErrors.noPair();
  const pair = await getPairRow(user.pair_id);
  if (!pair) throw appErrors.noPair('Пара не найдена. Создайте её заново.');

  const amountValue = formatRubAmount(priceRubForPlan(plan));
  const idempotenceKey = randomUUID();
  const requestBody = {
    amount: { value: amountValue, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: config.yookassa.returnUrl,
    },
    description: `PRO ${plan === 'monthly' ? 'на месяц' : 'на год'} — Пространство для двоих`,
    metadata: {
      pair_id: pair.id,
      user_id: String(userId),
      plan,
    },
  };

  let payment: YookassaPaymentObject;
  try {
    payment = await fetchJson<YookassaPaymentObject>(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    logger.error({ err: error, plan }, 'ЮKassa: не удалось создать платёж');
    if (error instanceof HttpError && error.status === 401) {
      throw appErrors.internal('Оплата картой временно недоступна');
    }
    throw appErrors.internal('Не удалось создать платёж. Попробуйте ещё раз.');
  }

  const confirmationUrl = payment.confirmation?.confirmation_url;
  if (!payment.id || !confirmationUrl) {
    logger.error({ paymentId: payment.id }, 'ЮKassa: ответ без id или confirmation_url');
    throw appErrors.internal('Платёжный шлюз вернул некорректный ответ');
  }

  const { error: insertError } = await supabaseAdmin.from('payments').insert({
    pair_id: pair.id,
    user_id: userId,
    provider: 'yookassa',
    provider_payment_id: payment.id,
    plan,
    amount: Number(amountValue),
    currency: 'RUB',
    status: 'pending',
    raw: payment,
  });
  if (insertError && insertError.code !== '23505') {
    throw mapDbError(insertError);
  }

  return { confirmationUrl, paymentId: payment.id };
}

/** Перепроверка платежа напрямую через API ЮKassa. */
export async function getYookassaPayment(paymentId: string): Promise<YookassaPaymentObject> {
  return fetchJson<YookassaPaymentObject>(
    `${API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: authHeader() },
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
  );
}

export async function markPaymentCanceled(providerPaymentId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('payments')
    .update({ status: 'canceled' })
    .eq('provider', 'yookassa')
    .eq('provider_payment_id', providerPaymentId)
    .eq('status', 'pending');
  if (error) {
    logger.warn({ err: error, providerPaymentId }, 'Не удалось пометить платёж canceled');
  }
}

export interface ActivatedYookassaPayment {
  alreadyProcessed: boolean;
  pairId: string;
  plan: PaymentPlan;
}

/**
 * Проверяет succeeded-платёж (metadata, сумма, валюта) и идемпотентно
 * активирует подписку через app_activate_paid_plan.
 */
export async function activateYookassaPayment(
  payment: YookassaPaymentObject,
): Promise<ActivatedYookassaPayment> {
  if (payment.status !== 'succeeded') {
    throw appErrors.internal('Платёж ещё не подтверждён');
  }

  const metadata = payment.metadata ?? {};
  const pairId = metadata.pair_id ?? '';
  const planRaw = metadata.plan ?? '';
  const userRaw = metadata.user_id ?? '';

  if (!pairId) throw appErrors.paymentConflict('В платеже нет идентификатора пары');
  if (planRaw !== 'monthly' && planRaw !== 'yearly') {
    throw appErrors.paymentConflict('В платеже нет корректного тарифа');
  }
  const plan: PaymentPlan = planRaw;

  const amount = payment.amount;
  if (!amount || amount.currency !== 'RUB') {
    throw appErrors.paymentConflict('Неверная валюта платежа');
  }
  const amountValue = Number.parseFloat(amount.value);
  if (!Number.isFinite(amountValue) || amountValue !== priceRubForPlan(plan)) {
    throw appErrors.paymentConflict('Сумма платежа не совпадает с тарифом');
  }

  const pair = await getPairRow(pairId);
  if (!pair) throw appErrors.pairNotFound();

  const paidBy = /^\d+$/.test(userRaw) ? Number.parseInt(userRaw, 10) : pair.user1_id;

  const result = await callRpc<ActivatePaidPlanResult>('app_activate_paid_plan', {
    p_pair_id: pairId,
    p_plan: plan,
    p_provider: 'yookassa',
    p_provider_payment_id: payment.id,
    p_amount: amountValue,
    p_currency: amount.currency,
    p_paid_by: paidBy,
    p_raw: payment,
  });

  if (!result.already_processed) {
    const participantIds = await getPairParticipantIds(result.pair.id);
    await notifyPaymentSuccess(participantIds, plan);
  }

  return { alreadyProcessed: result.already_processed, pairId, plan };
}

export interface YookassaWebhookUpdate {
  event?: string;
  object: {
    id: string;
  };
}

/**
 * Обработка webhook: обязательная перепроверка платежа через API,
 * затем идемпотентная активация или отмена pending-записи.
 */
export async function handleYookassaWebhook(
  update: YookassaWebhookUpdate,
): Promise<{ activated: boolean }> {
  let payment: YookassaPaymentObject;
  try {
    // Обязательная перепроверка: webhook-тело не считается доверенным.
    payment = await getYookassaPayment(update.object.id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      // Платёж не найден в ЮKassa — игнорируем, повторные доставки не помогут.
      logger.warn(
        { paymentId: update.object.id, event: update.event },
        'ЮKassa webhook: платёж не найден',
      );
      return { activated: false };
    }
    throw error;
  }

  if (payment.status === 'succeeded') {
    const result = await activateYookassaPayment(payment);
    return { activated: !result.alreadyProcessed };
  }

  if (payment.status === 'canceled') {
    await markPaymentCanceled(payment.id);
  }

  return { activated: false };
}

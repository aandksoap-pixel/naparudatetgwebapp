/**
 * Telegram Stars: счёт, проверка подписанного payload, pre_checkout_query
 * и successful_payment. Сумма и валюта проверяются и до оплаты, и после.
 *
 * Payload-формат (не длиннее 128 байт): `<pairId>.<m|y>.<userId>.<nonce>.<sig16>`
 * где sig16 = первые 16 hex-символов HMAC-SHA256(PAYMENT_SIGNING_SECRET).
 */
import { createHmac, randomBytes } from 'node:crypto';
import { Api } from 'grammy';
import { config } from '../../config.js';
import { appErrors } from '../../lib/errors.js';
import { safeCompare } from '../../lib/html.js';
import { logger } from '../../lib/logger.js';
import { callRpc } from '../../lib/supabase.js';
import type { ActivatePaidPlanResult, PaymentPlan } from '../../types.js';
import { notifyPaymentSuccess } from '../notifications.js';
import { getPairParticipantIds, getPairRow, getUserRow } from '../state.js';

const api = new Api(config.telegram.botToken);

const SIGNATURE_LENGTH = 16;
const PLAN_SHORT: Record<PaymentPlan, 'm' | 'y'> = { monthly: 'm', yearly: 'y' };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function starsForPlan(plan: PaymentPlan): number {
  return plan === 'monthly' ? config.payment.starsMonthly : config.payment.starsYearly;
}

function signPayloadBase(base: string): string {
  return createHmac('sha256', config.payment.signingSecret)
    .update(base)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH);
}

export function buildInvoicePayload(
  pairId: string,
  plan: PaymentPlan,
  userId: number,
): string {
  const shortPlan = PLAN_SHORT[plan];
  const nonce = randomBytes(4).toString('hex');
  const base = `${pairId}.${shortPlan}.${userId}.${nonce}`;
  return `${base}.${signPayloadBase(base)}`;
}

export interface ParsedInvoicePayload {
  pairId: string;
  plan: PaymentPlan;
  userId: number;
  nonce: string;
}

/** Разбирает и проверяет подпись payload. Возвращает null для любого нарушения. */
export function parseInvoicePayload(payload: string): ParsedInvoicePayload | null {
  const parts = payload.split('.');
  if (parts.length !== 5) return null;

  const pairId = parts[0];
  const shortPlan = parts[1];
  const userRaw = parts[2];
  const nonce = parts[3];
  const signature = parts[4];

  if (!pairId || !shortPlan || !userRaw || !nonce || !signature) return null;
  if (!UUID_REGEX.test(pairId)) return null;
  if (shortPlan !== 'm' && shortPlan !== 'y') return null;
  if (!/^\d+$/.test(userRaw)) return null;
  if (!/^[0-9a-f]{8}$/i.test(nonce)) return null;
  if (!/^[0-9a-f]{16}$/i.test(signature)) return null;

  const userId = Number.parseInt(userRaw, 10);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const expectedSignature = signPayloadBase(`${pairId}.${shortPlan}.${userRaw}.${nonce}`);
  if (!safeCompare(expectedSignature, signature.toLowerCase())) return null;

  return {
    pairId,
    plan: shortPlan === 'm' ? 'monthly' : 'yearly',
    userId,
    nonce,
  };
}

/** Создаёт invoice link для Telegram Stars (provider_token для XTR пустой). */
export async function createStarsInvoiceLink(
  userId: number,
  plan: PaymentPlan,
): Promise<string> {
  const user = await getUserRow(userId);
  if (!user.pair_id) throw appErrors.noPair();
  const pair = await getPairRow(user.pair_id);
  if (!pair) throw appErrors.noPair('Пара не найдена. Создайте её заново.');

  const payload = buildInvoicePayload(pair.id, plan, userId);
  const amount = starsForPlan(plan);
  const title = plan === 'monthly' ? 'PRO на месяц' : 'PRO на год';
  const description =
    plan === 'monthly'
      ? 'Безлимитные свайпы фильмов и еды, безлимит напоминаний. Подписка на 30 дней для вас двоих.'
      : 'Безлимитные свайпы фильмов и еды, безлимит напоминаний. Подписка на 365 дней для вас двоих.';

  try {
    return await api.raw.createInvoiceLink({
      title,
      description,
      payload,
      // Telegram Bot API требует поле provider_token; для XTR оно должно быть пустым.
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: title, amount }],
    });
  } catch (error) {
    logger.error({ err: error, plan }, 'Не удалось создать счёт Telegram Stars');
    throw appErrors.internal('Не удалось создать счёт на оплату. Попробуйте позже.');
  }
}

export interface PreCheckoutQueryLike {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

async function answerPreCheckoutQuery(
  queryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    await api.answerPreCheckoutQuery(
      queryId,
      ok,
      ok ? undefined : { error_message: errorMessage ?? 'Не удалось подтвердить платёж' },
    );
  } catch (error) {
    logger.error({ err: error }, 'Не удалось ответить на pre_checkout_query');
  }
}

/** Проверка pre_checkout_query: payload, сумма, валюта, пара. */
export async function handlePreCheckoutQuery(
  query: PreCheckoutQueryLike,
): Promise<boolean> {
  try {
    const parsed = parseInvoicePayload(query.invoice_payload);
    if (!parsed) {
      await answerPreCheckoutQuery(query.id, false, 'Счёт устарел. Создайте новый в приложении.');
      return false;
    }
    if (query.from.id !== parsed.userId) {
      await answerPreCheckoutQuery(query.id, false, 'Счёт создан для другого пользователя.');
      return false;
    }
    if (query.currency !== 'XTR') {
      await answerPreCheckoutQuery(query.id, false, 'Неверная валюта платежа.');
      return false;
    }
    if (query.total_amount !== starsForPlan(parsed.plan)) {
      await answerPreCheckoutQuery(query.id, false, 'Неверная сумма платежа.');
      return false;
    }
    const pair = await getPairRow(parsed.pairId);
    if (!pair) {
      await answerPreCheckoutQuery(query.id, false, 'Пара не найдена.');
      return false;
    }
    await answerPreCheckoutQuery(query.id, true);
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Ошибка проверки pre_checkout_query');
    await answerPreCheckoutQuery(query.id, false, 'Не удалось проверить платёж.');
    return false;
  }
}

export interface SuccessfulPaymentLike {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

/**
 * successful_payment: повторная проверка payload/суммы и идемпотентная
 * активация через app_activate_paid_plan.
 */
export async function handleSuccessfulPayment(
  payment: SuccessfulPaymentLike,
  payerId: number,
): Promise<void> {
  const parsed = parseInvoicePayload(payment.invoice_payload);
  if (!parsed) {
    logger.warn({ payerId }, 'Получен платёж Stars с неизвестным payload');
    return;
  }
  if (payment.currency !== 'XTR') {
    logger.warn({ payerId, currency: payment.currency }, 'Платёж Stars с неверной валютой');
    return;
  }
  if (payment.total_amount !== starsForPlan(parsed.plan)) {
    logger.warn(
      { payerId, expected: starsForPlan(parsed.plan), actual: payment.total_amount },
      'Платёж Stars с неверной суммой',
    );
    return;
  }

  const pair = await getPairRow(parsed.pairId);
  if (!pair) {
    logger.warn({ payerId, pairId: parsed.pairId }, 'Платёж Stars для несуществующей пары');
    return;
  }

  const result = await callRpc<ActivatePaidPlanResult>('app_activate_paid_plan', {
    p_pair_id: parsed.pairId,
    p_plan: parsed.plan,
    p_provider: 'telegram_stars',
    p_provider_payment_id: payment.telegram_payment_charge_id,
    p_amount: payment.total_amount,
    p_currency: payment.currency,
    p_paid_by: payerId,
    p_raw: payment,
  });

  if (!result.already_processed) {
    const participantIds = await getPairParticipantIds(result.pair.id);
    await notifyPaymentSuccess(participantIds, parsed.plan);
  }
}

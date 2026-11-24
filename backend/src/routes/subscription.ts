/** Подписка: триал, счёт Telegram Stars, платёж ЮKassa, синхронизация оплаты. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { parseInput, subscriptionPlanSchema } from '../lib/validation.js';
import {
  createStarsInvoiceLink,
  reconcileStarPaymentsForUser,
} from '../services/payments/telegram-stars.js';
import { buildState } from '../services/state.js';
import { activateTrial } from '../services/subscription.js';

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.post('/subscription/trial', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    await activateTrial(auth.userId);
    const state = await buildState(auth.userId);
    return { state };
  });

  app.post(
    '/subscription/stars-invoice',
    { preHandler: requireTelegramAuth },
    async (request) => {
      const auth = getAuth(request);
      const input = parseInput(subscriptionPlanSchema, request.body);
      const invoiceLink = await createStarsInvoiceLink(auth.userId, input.plan);
      return { invoiceLink };
    },
  );

  app.post('/subscription/sync', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    // Сверяем Star-транзакции на случай, если webhook бота не дошёл.
    await reconcileStarPaymentsForUser(auth.userId);
    const state = await buildState(auth.userId);
    return { state, pending: false };
  });
};

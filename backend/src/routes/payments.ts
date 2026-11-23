/**
 * POST /webhook/yookassa — платёжные уведомления ЮKassa.
 * Тело не считается доверенным: статус платежа перепроверяется через API.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../lib/validation.js';
import { handleYookassaWebhook } from '../services/payments/yookassa.js';

const yookassaWebhookSchema = z
  .object({
    event: z.string().max(64).optional(),
    object: z
      .object({
        id: z.string().min(1).max(128),
      })
      .passthrough(),
  })
  .passthrough();

export const paymentWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhook/yookassa', { config: { rateLimit: false } }, async (request) => {
    const input = parseInput(
      yookassaWebhookSchema,
      request.body,
      'Некорректное уведомление ЮKassa',
    );

    const result = await handleYookassaWebhook({
      event: input.event,
      object: { id: input.object.id },
    });

    return { ok: true, activated: result.activated };
  });
};

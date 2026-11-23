/**
 * POST /api/cron/tick — ручной запуск планировщика (внешний cron).
 * Защищён заголовком X-Cron-Secret (timing-safe сравнение).
 */
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { appErrors } from '../lib/errors.js';
import { safeCompare } from '../lib/html.js';
import { runJobs } from '../jobs.js';
import type { CronTickResponse } from '../types.js';

export const cronRoutes: FastifyPluginAsync = async (app) => {
  app.post('/cron/tick', { config: { rateLimit: false } }, async (request, reply) => {
    if (!config.cronSecret) {
      reply.code(503).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Cron не настроен: CRON_SECRET не задан',
        },
      });
      return;
    }

    const rawHeader = request.headers['x-cron-secret'];
    const provided = typeof rawHeader === 'string'
      ? rawHeader
      : Array.isArray(rawHeader)
        ? (rawHeader[0] ?? null)
        : null;

    if (!provided || !safeCompare(provided, config.cronSecret)) {
      throw appErrors.invalidInitData('Неверный секрет cron');
    }

    const result = await runJobs({ forceSubscriptions: true });
    const response: CronTickResponse = {
      ok: true,
      remindersClaimed: result.remindersClaimed,
      subscriptionsExpired: result.subscriptionsExpired,
    };
    return response;
  });
};

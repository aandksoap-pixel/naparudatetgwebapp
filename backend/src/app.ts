/**
 * Сборка Fastify-приложения: безопасность, CORS, rate limit, единый
 * обработчик ошибок, маршруты.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { AppError, appErrors, errorPayload, toAppError } from './lib/errors.js';
import { logger, loggerOptions } from './lib/logger.js';
import { registerRoutes } from './routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    bodyLimit: 64 * 1024,
    disableRequestLogging: false,
  });

  // Контекст авторизации заполняется в preHandler requireTelegramAuth.
  app.decorateRequest('auth', null);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Запросы без Origin (curl, Telegram webhook) не ограничиваем.
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.replace(/\/+$/, '');
      const allowed =
        config.corsOrigins.includes('*') || config.corsOrigins.includes(normalized);
      callback(null, allowed);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'X-Cron-Secret', 'X-Channel-Check'],
    maxAge: 86400,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    // Webhook-и Telegram и ЮKassa не должны попадать под лимит по IP.
    allowList: (request) => request.url.startsWith('/webhook/'),
    // Плагин бросает возвращённое значение как ошибку — отдаём AppError,
    // чтобы глобальный обработчик вернул наш формат 429 RATE_LIMITED.
    errorResponseBuilder: () => appErrors.rateLimited(),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send(errorPayload(error));
      return;
    }
    if (error instanceof ZodError) {
      const appError = toAppError(error);
      reply.code(appError.statusCode).send(errorPayload(appError));
      return;
    }

    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;

    if (statusCode === 429) {
      reply.code(429).send(errorPayload(appErrors.rateLimited()));
      return;
    }
    if (statusCode === 413) {
      reply
        .code(400)
        .send(errorPayload(appErrors.validation('Слишком большой запрос')));
      return;
    }
    // Ошибки парсинга тела (битый JSON и т. п.) — это 400, а не 500.
    if (statusCode >= 400 && statusCode < 500) {
      reply.code(400).send(errorPayload(appErrors.validation(error.message)));
      return;
    }

    logger.error(
      { err: error, reqId: request.id, method: request.method, url: request.url },
      'Необработанная ошибка запроса',
    );
    reply.code(500).send(errorPayload(appErrors.internal()));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Маршрут ${request.method} ${request.url} не найден`,
      },
    });
  });

  await registerRoutes(app);

  return app;
}

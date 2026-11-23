/**
 * POST /webhook/telegram — приём апдейтов Telegram в webhook-режиме.
 * Секрет сравнивается с X-Telegram-Bot-Api-Secret-Token за константное время.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Update } from 'grammy/types';
import { bot } from '../bot/bot.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { safeCompare } from '../lib/html.js';

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhook/telegram', { config: { rateLimit: false } }, async (request, reply) => {
    const secret = config.telegram.webhookSecret;
    if (!secret) {
      reply.code(503).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Webhook не настроен: TELEGRAM_WEBHOOK_SECRET не задан',
        },
      });
      return;
    }

    const rawHeader = request.headers['x-telegram-bot-api-secret-token'];
    const provided = typeof rawHeader === 'string'
      ? rawHeader
      : Array.isArray(rawHeader)
        ? (rawHeader[0] ?? null)
        : null;

    if (!provided || !safeCompare(provided, secret)) {
      reply.code(401).send({
        error: {
          code: 'INVALID_INIT_DATA',
          message: 'Неверный секрет webhook',
        },
      });
      return;
    }

    const update = request.body;
    if (typeof update !== 'object' || update === null) {
      reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Некорректный апдейт Telegram',
        },
      });
      return;
    }

    try {
      await bot.handleUpdate(update as Update);
    } catch (error) {
      // Отвечаем 200, чтобы Telegram не зациклил доставку одного и того же апдейта.
      logger.error({ err: error }, 'Ошибка обработки webhook-апдейта Telegram');
    }

    return { ok: true };
  });
};

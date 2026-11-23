/**
 * POST /api/session — инициализация сессии: ensureUser, обработка start_param
 * (deep-link join_<code>), AppState, Realtime-токен и публичная конфигурация.
 */
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { createRealtimeToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { normalizeInviteCode } from '../lib/validation.js';
import { joinPair } from '../services/pairs.js';
import { buildState } from '../services/state.js';
import { getPublicConfig } from '../services/subscription.js';
import type { SessionResponse } from '../types.js';

const JOIN_START_PARAM_REGEX = /^join_/i;

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/session',
    { preHandler: requireTelegramAuth },
    async (request): Promise<SessionResponse> => {
      const auth = getAuth(request);
      const startParam = auth.initData.startParam;
      let notice: string | undefined;

      if (startParam && JOIN_START_PARAM_REGEX.test(startParam) && !auth.user.pair_id) {
        try {
          await joinPair(auth.userId, normalizeInviteCode(startParam));
          notice = 'Вы объединились с партнёром! 🎉';
        } catch (error) {
          notice =
            error instanceof AppError
              ? error.message
              : 'Не удалось присоединиться к паре по приглашению';
          logger.info(
            { err: error, userId: auth.userId },
            'Не удалось присоединиться по start_param',
          );
        }
      }

      const state = await buildState(auth.userId);
      const response: SessionResponse = {
        state,
        realtime: {
          url: config.supabase.url,
          anonKey: config.supabase.anonKey,
          token: createRealtimeToken({
            userId: auth.userId,
            pairId: state.pair?.id ?? null,
          }),
        },
        config: getPublicConfig(),
      };

      if (notice) {
        response.notice = notice;
      }
      return response;
    },
  );
};

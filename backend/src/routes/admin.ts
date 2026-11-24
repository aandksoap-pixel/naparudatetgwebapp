/** Админ-панель: аналитика, выдача и отзыв PRO. Только для ADMIN_TELEGRAM_IDS. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getAuth, requireAdmin, requireTelegramAuth } from '../lib/auth.js';
import { appErrors } from '../lib/errors.js';
import { parseInput } from '../lib/validation.js';
import { getAdminOverview, grantPro, revokePro } from '../services/admin.js';

const grantSchema = z
  .object({
    pairId: z.string().uuid().optional(),
    userId: z.number().int().positive().optional(),
    duration: z.enum(['month', 'year', 'forever', 'custom', 'trial']),
    days: z.number().int().min(1).max(36500).optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((value) => Boolean(value.pairId || value.userId), {
    message: 'Укажите pairId или userId',
    path: ['pairId'],
  })
  .refine((value) => value.duration !== 'custom' || Boolean(value.days), {
    message: 'Для custom укажите days',
    path: ['days'],
  });

const revokeSchema = z.object({
  pairId: z.string().uuid(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/admin/overview',
    { preHandler: [requireTelegramAuth, requireAdmin] },
    async () => getAdminOverview(),
  );

  app.post(
    '/admin/grant',
    { preHandler: [requireTelegramAuth, requireAdmin] },
    async (request) => {
      const auth = getAuth(request);
      const input = parseInput(grantSchema, request.body);
      try {
        return await grantPro({
          adminId: auth.userId,
          pairId: input.pairId,
          userId: input.userId,
          duration: input.duration,
          days: input.days,
          note: input.note ?? null,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'PAIR_NOT_FOUND') {
          throw appErrors.pairNotFound('У пользователя ещё нет пары');
        }
        if (error instanceof Error && error.message === 'INVALID_DURATION') {
          throw appErrors.validation('Некорректный срок подписки');
        }
        throw error;
      }
    },
  );

  app.post(
    '/admin/revoke',
    { preHandler: [requireTelegramAuth, requireAdmin] },
    async (request) => {
      const auth = getAuth(request);
      const input = parseInput(revokeSchema, request.body);
      try {
        return await revokePro({
          adminId: auth.userId,
          pairId: input.pairId,
          note: input.note ?? null,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'PAIR_NOT_FOUND') {
          throw appErrors.pairNotFound();
        }
        throw error;
      }
    },
  );
};

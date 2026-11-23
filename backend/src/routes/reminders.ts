/** Напоминания: создание и отметка «выполнено» из приложения. */
import type { FastifyPluginAsync } from 'fastify';
import { getAuth, requireTelegramAuth } from '../lib/auth.js';
import { idParamSchema, parseInput, reminderCreateSchema } from '../lib/validation.js';
import { createReminder, markReminderDone } from '../services/reminders.js';
import { buildState, toReminderInfo } from '../services/state.js';

export const reminderRoutes: FastifyPluginAsync = async (app) => {
  app.post('/reminders', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const input = parseInput(reminderCreateSchema, request.body);

    const outcome = await createReminder(auth.userId, input.text, input.remindAt);
    const state = await buildState(auth.userId);

    return {
      state,
      reminder: toReminderInfo(outcome.reminder),
    };
  });

  app.post('/reminders/:id/done', { preHandler: requireTelegramAuth }, async (request) => {
    const auth = getAuth(request);
    const params = parseInput(idParamSchema, request.params);

    const reminder = await markReminderDone(auth.userId, params.id);
    const state = await buildState(auth.userId);

    return {
      state,
      reminder: toReminderInfo(reminder),
    };
  });
};
